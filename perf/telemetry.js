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

  let browser = 'Unknown Browser';
  if (ua.includes('Firefox')) {
    browser = 'Firefox';
    const match = ua.match(/Firefox\/(\d+)/);
    if (match) browser += ` ${match[1]}`;
  } else if (ua.includes('Edg/')) {
    browser = 'Edge';
    const match = ua.match(/Edg\/(\d+)/);
    if (match) browser += ` ${match[1]}`;
  } else if (ua.includes('Chrome')) {
    browser = 'Chrome';
    const match = ua.match(/Chrome\/(\d+)/);
    if (match) browser += ` ${match[1]}`;
  } else if (ua.includes('Safari')) {
    browser = 'Safari';
    const match = ua.match(/Version\/(\d+)/);
    if (match) browser += ` ${match[1]}`;
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
    }
  } catch (e) {
    console.error('Telemetry failed to capture GPU', e);
  }

  const coreStr = logicalCores ? `${logicalCores} Threads` : 'Unknown Cores';
  return `${os} • ${browser} • ${gpuName} • ${coreStr}`;
}
