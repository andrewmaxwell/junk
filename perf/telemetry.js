export const logicalCores = navigator.hardwareConcurrency || 4;

export function getSystemInfo() {
  const ua = navigator.userAgent;
  let os = 'Unknown OS';

  if (ua.includes('Win')) {
    os = 'Windows';
  } else if (ua.includes('Mac')) {
    os = 'macOS';
  } else if (ua.includes('iPhone') || ua.includes('iPad')) {
    os = 'iOS';
  } else if (ua.includes('Android')) {
    os = 'Android';
    const androidMatch = ua.match(/Android ([\d.]+)/);
    if (androidMatch) os += ` ${androidMatch[1]}`;
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
      // @ts-expect-error: extension is non standard properly shielded
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        // @ts-expect-error: Safe unmasking pipeline constant
        const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
        const parts = renderer.split(',');
        gpuName =
          parts.length > 1
            ? parts[1].split('Direct3D')[0].split('OpenGL')[0].trim()
            : renderer.split('Direct3D')[0].split('OpenGL')[0].trim();

        if (gpuName.includes('ANGLE Metal Renderer:')) {
          gpuName = gpuName.replace('ANGLE Metal Renderer:', '').trim();
        }
      }
    }
  } catch (e) {
    console.error('Telemetry failed to capture GPU', e);
  }

  return `${os} • ${browser} • ${gpuName} • ${logicalCores} Threads`;
}
