export const logicalCores = navigator.hardwareConcurrency || null;

export function getSystemInfo() {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';

  if (ua.includes('Win')) {
    os = 'Windows';
  } else if (
    ua.includes('iPhone') ||
    ua.includes('iPad') ||
    (ua.includes('Mac') && navigator.maxTouchPoints > 1)
  ) {
    // iPads request Desktop websites by default, faking the Mac OS string. maxTouchPoints reveals the touchscreen.
    os = 'iOS / iPadOS';
  } else if (ua.includes('Mac')) {
    os = 'macOS';
  } else if (ua.includes('Android')) {
    os = 'Android';
  } else if (ua.includes('Linux')) {
    os = 'Linux';
  }

  // Order matters: Edge and Chrome UAs also mention Chrome and Safari.
  // iOS browsers use their own tokens (FxiOS, EdgiOS, CriOS) on top of Safari.
  /** @type {[string, RegExp][]} */
  const browsers = [
    ['Firefox', /(?:Firefox|FxiOS)\/(\d+)/],
    ['Edge', /(?:Edg|EdgiOS|EdgA)\/(\d+)/],
    ['Chrome', /(?:Chrome|CriOS)\/(\d+)/],
    ['Safari', /Version\/(\d+).*Safari/],
  ];
  let browser = 'Unknown Browser';
  for (const [name, pattern] of browsers) {
    const match = ua.match(pattern);
    if (match) {
      browser = `${name} ${match[1]}`;
      break;
    }
  }

  let gpuName = 'Unknown GPU';
  try {
    const canvas = document.createElement('canvas');
    const gl =
      canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    if (gl) {
      // @ts-expect-error: Non-standard webgl context method safely guarded
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        // @ts-expect-error: Safely unwrapping non-standard renderer context
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const parts = renderer.split(',');
        // Clean up verbose ANGLE drivers on Windows/Chrome
        gpuName =
          parts.length > 1
            ? parts[1].split('Direct3D')[0].split('OpenGL')[0].trim()
            : renderer.split('Direct3D')[0].split('OpenGL')[0].trim();

        if (gpuName.includes('ANGLE Metal Renderer:')) {
          gpuName = gpuName.replace('ANGLE Metal Renderer:', '').trim();
        }
        // Firefox obfuscation cleanup
        if (gpuName.includes('or similar')) {
          gpuName = gpuName.replace('or similar', '').trim();
        }
      }
      // Browsers cap live WebGL contexts, so don't hold this one until GC
      // @ts-expect-error: Non-standard webgl context method safely guarded
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) {
    console.error('Telemetry failed to capture GPU', e);
  }

  const coreStr = logicalCores ? `${logicalCores} Threads` : 'Unknown Cores';
  return `${os} • ${browser} • ${gpuName} • ${coreStr}`;
}
