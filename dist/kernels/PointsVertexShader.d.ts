declare const _default: "\nprecision highp float;\nprecision highp int;\n\n// Cannot use int vertex attributes: https://stackoverflow.com/questions/27874983/webgl-how-to-use-integer-attributes-in-glsl\nattribute float aIndex; // Index of point.\n\nuniform sampler2D u_positions; // Texture lookup with position data.\nuniform vec2 u_positionDimensions;\nuniform vec2 u_scale;\nuniform float u_pointSize;\n\nvarying vec2 v_UV;\nvarying vec2 vParticleUV;\n\n/**\n * Returns accurate MOD when arguments are approximate integers.\n */\nfloat modI(float a, float b) {\n    float m = a - floor((a + 0.5) / b) * b;\n    return floor(m + 0.5);\n}\n\nvoid main() {\n\t// Calculate a uv based on the point's index attribute.\n\tvParticleUV = vec2(modI(aIndex, u_positionDimensions.x), floor(floor(aIndex + 0.5) / u_positionDimensions.x)) / u_positionDimensions;\n\n\t// Calculate a global uv for the viewport.\n\t// Lookup vertex position and scale to [0, 1] range.\n\tv_UV = texture2D(u_positions, vParticleUV).xy * u_scale;\n\n\t// Calculate position in [-1, 1] range.\n\tvec2 position = v_UV * 2.0 - 1.0;\n\n\tgl_PointSize = u_pointSize;\n\tgl_Position = vec4(position, 0, 1);\n}\n";
export default _default;
