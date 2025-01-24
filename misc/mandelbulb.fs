// refactored from https://www.shadertoy.com/view/dltBzM

const int bulbIterations = 8;

float mandelbulbSDF(vec3 position) {
    float bulbPower = 4.0 + iTime / 100.0;
    vec3 z = position;
    float dr = 1.0;
    float radius = 0.0;

    for (int i = 0; i < bulbIterations; i++) {
        radius = length(z);
        if (radius > 2.0) break;

        float theta = acos(z.z / radius) * bulbPower;
        float phi = atan(z.y, z.x) * bulbPower;
        dr = pow(radius, bulbPower - 1.0) * bulbPower * dr + 1.0;
        z = position + pow(radius, bulbPower) * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta));
    }
    return 0.5 * log(radius) * radius / dr;
}

vec3 rotate(vec3 vector, vec2 angle) {
    vector.yz = cos(angle.y) * vector.yz + sin(angle.y) * vec2(-1, 1) * vector.zy;
    vector.xz = cos(angle.x) * vector.xz + sin(angle.x) * vec2(-1, 1) * vector.zx;
    return vector;
}

vec3 rayMarch(vec2 fragCoord, vec2 angle) {
    vec3 rayDirection = rotate(normalize(vec3((fragCoord - iResolution.xy * 0.5) / iResolution.x, 1)), angle);
    vec3 startPosition = rotate(vec3(0, 0, -3), angle);
    for (int i = 0; i < 128; i++) {
        float distance = mandelbulbSDF(startPosition);
        if (distance < 0.001) break;
        startPosition += rayDirection * distance;
    }
    return startPosition;
}

void mainImage(out vec4 fragColor, in vec2 fragCoord) {
    vec2 angle = (0.5 - iMouse.xy / iResolution.xy) * 5.0;
    vec3 position = rayMarch(fragCoord, angle);

    const vec2 ep = vec2(1, -1) * 0.000001;
    vec3 normal = normalize(ep.xyy * mandelbulbSDF(position + ep.xyy) + 
                            ep.yyx * mandelbulbSDF(position + ep.yyx) + 
                            ep.yxy * mandelbulbSDF(position + ep.yxy) + 
                            ep.xxx * mandelbulbSDF(position + ep.xxx));

    vec3 ambientLight = vec3(sin(normal.x), sin(normal.y), sin(normal.z));
    vec3 lightDirection = normalize(rotate(vec3(0, 0, -3), angle) - position);
    float lightIntensity = max(dot(normal, -lightDirection), dot(normal, lightDirection));

    fragColor.rgb = 0.7 * lightIntensity + pow(lightIntensity, 128.0) + ambientLight * 0.3;
}
