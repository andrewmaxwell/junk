// Shared Google OAuth for the fetch scripts. One consent grants every scope,
// so adding a scope here makes the next run of any script ask again. The
// Health API rejects tokens carrying any other API's scopes, so each request
// uses an access token narrowed to just its own API.

import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {execFile} from 'node:child_process';
import {readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';

export const dataDir = join(import.meta.dirname, 'data');
const clientPath = join(dataDir, 'google-client.json');
const tokenPath = join(dataDir, 'google-token.json');

const apiScopes = {
  health: [
    'activity_and_fitness',
    'health_metrics_and_measurements',
    'sleep',
  ].map((s) => `https://www.googleapis.com/auth/googlehealth.${s}.readonly`),
  calendar: ['https://www.googleapis.com/auth/calendar.events.readonly'],
};
const scopes = Object.values(apiScopes).flat();

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const readJson = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return undefined;
  }
};

const postForm = async (url, params) => {
  const res = await fetch(url, {
    method: 'POST',
    body: new URLSearchParams(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`${url} ${res.status}: ${JSON.stringify(body)}`);
  return body;
};

// Opens the consent page and catches the redirect on a loopback port, which
// Google allows for "Desktop app" OAuth clients.
const authorize = async ({client_id, client_secret}) => {
  const state = randomBytes(16).toString('hex');
  const server = createServer();
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const redirect_uri = `http://127.0.0.1:${server.address().port}`;

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams(
    {
      client_id,
      redirect_uri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state,
    },
  )}`;
  console.log(
    `Opening browser to authorize. If it doesn't open, visit:\n${url}\n`,
  );
  execFile('open', [url]);

  const code = await new Promise((resolve, reject) => {
    server.on('request', (req, res) => {
      const params = new URL(req.url, redirect_uri).searchParams;
      if (!params.has('code') && !params.has('error')) return res.end();
      res.end('Done, you can close this tab.');
      server.close();
      if (params.get('state') !== state)
        reject(new Error('OAuth state mismatch'));
      else if (params.has('error')) reject(new Error(params.get('error')));
      else resolve(params.get('code'));
    });
  });

  return postForm('https://oauth2.googleapis.com/token', {
    code,
    client_id,
    client_secret,
    redirect_uri,
    grant_type: 'authorization_code',
  });
};

const getAccessToken = async (api) => {
  const file = await readJson(clientPath);
  if (!file) throw new Error(`Missing ${clientPath}, see README.md`);
  const client = file.installed ?? file.web ?? file;

  const saved = await readJson(tokenPath);
  const granted = saved?.scope?.split(' ') ?? [];
  if (saved?.refresh_token && scopes.every((s) => granted.includes(s))) {
    try {
      const {access_token} = await postForm(
        'https://oauth2.googleapis.com/token',
        {
          client_id: client.client_id,
          client_secret: client.client_secret,
          refresh_token: saved.refresh_token,
          grant_type: 'refresh_token',
          scope: apiScopes[api].join(' '),
        },
      );
      return access_token;
    } catch (e) {
      // Refresh tokens expire after 7 days while the app is in Testing mode.
      console.log(`Refresh failed, reauthorizing. (${e.message})`);
    }
  }

  await writeFile(tokenPath, JSON.stringify(await authorize(client), null, 2));
  return getAccessToken(api);
};

const accessTokens = {};

// GETs a Google API URL, retrying rate limits and server errors, and getting
// a fresh access token when the current one expires mid-run.
export const googleGet = async (api, url) => {
  accessTokens[api] ??= await getAccessToken(api);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: {Authorization: `Bearer ${accessTokens[api]}`},
    });
    if (res.ok) return res.json();
    if (res.status === 401 && attempt === 0) {
      accessTokens[api] = await getAccessToken(api);
      continue;
    }
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await sleep(2000 * 2 ** attempt);
      continue;
    }
    throw new Error(`${res.status}: ${await res.text()}`);
  }
};
