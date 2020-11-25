"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DataLayer = void 0;
var float16_1 = require("@petamoriken/float16");
var extensions_1 = require("./extensions");
var utils_1 = require("./utils");
var DataLayer = /** @class */ (function () {
    function DataLayer(name, gl, options, errorCallback, writable, numBuffers) {
        this.bufferIndex = 0;
        this.buffers = [];
        // Save params.
        this.name = name;
        this.gl = gl;
        this.errorCallback = errorCallback;
        if (numBuffers < 0 || numBuffers % 1 !== 0) {
            throw new Error("Invalid numBuffers: " + numBuffers + " for DataLayer " + this.name + ", must be positive integer.");
        }
        this.numBuffers = numBuffers;
        // Save options.
        if (!isNaN(options.dimensions)) {
            if (options.dimensions < 1) {
                throw new Error("Invalid length " + options.dimensions + " for DataLayer " + name + ".");
            }
            this.length = options.dimensions;
            var _a = this.calcWidthHeight(options.dimensions), width = _a[0], height = _a[1];
            this.width = width;
            this.height = height;
        }
        else {
            this.width = options.dimensions[0];
            this.height = options.dimensions[1];
        }
        this.numComponents = options.numComponents;
        this.writable = writable;
        // Check that gl will support the datatype.
        this.type = DataLayer.checkType(this.gl, options.type, this.writable, this.errorCallback);
        // Get current filter setting.
        // If we are processing a 1D array, default to nearest filtering.
        // Else default to linear filtering.
        var filter = options.filter ? options.filter : (this.length ? 'NEAREST' : 'LINEAR');
        this.filter = gl[DataLayer.checkFilter(this.gl, filter, this.type, this.errorCallback)];
        this.wrapS = gl[DataLayer.checkWrap(this.gl, options.wrapS ? options.wrapS : 'CLAMP_TO_EDGE', this.type)];
        this.wrapT = gl[DataLayer.checkWrap(this.gl, options.wrapT ? options.wrapT : 'CLAMP_TO_EDGE', this.type)];
        var _b = DataLayer.getGLTextureParameters(this.gl, this.name, {
            numComponents: this.numComponents,
            writable: this.writable,
            type: this.type,
        }, this.errorCallback), glFormat = _b.glFormat, glInternalFormat = _b.glInternalFormat, glType = _b.glType, glNumChannels = _b.glNumChannels;
        this.glInternalFormat = glInternalFormat;
        this.glFormat = glFormat;
        this.glType = glType;
        this.glNumChannels = glNumChannels;
        this.initBuffers(options.data);
    }
    DataLayer.prototype.calcWidthHeight = function (length) {
        // Calc power of two width and height for length.
        var exp = 1;
        var remainder = length;
        while (remainder > 2) {
            exp++;
            remainder /= 2;
        }
        return [
            Math.pow(2, Math.floor(exp / 2) + exp % 2),
            Math.pow(2, Math.floor(exp / 2)),
        ];
    };
    DataLayer.checkWrap = function (gl, wrap, type) {
        if (utils_1.isWebGL2(gl)) {
            return wrap;
        }
        if (wrap === 'CLAMP_TO_EDGE') {
            return wrap;
        }
        if (type === 'float32' || type === 'float16') {
            // TODO: we may want to handle this in the frag shader.
            // REPEAT and MIRROR_REPEAT wrap not supported for non-power of 2 float textures in safari.
            // I've tested this and it seems that some power of 2 textures will work (512 x 512),
            // but not others (1024x1024), so let's just change all WebGL 1.0 to CLAMP.
            // TODO: test for this more thoroughly.
            // Without this, we currently get an error at drawArrays():
            // WebGL: drawArrays: texture bound to texture unit 0 is not renderable.
            // It maybe non-power-of-2 and have incompatible texture filtering or is not
            // 'texture complete', or it is a float/half-float type with linear filtering and
            // without the relevant float/half-float linear extension enabled.
            return 'CLAMP_TO_EDGE';
        }
        return wrap;
    };
    DataLayer.checkFilter = function (gl, filter, type, errorCallback) {
        if (filter === 'NEAREST') {
            return filter;
        }
        if (type === 'float16') {
            // TODO: test if float linear extension is actually working.
            var extension = extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_HAlF_FLOAT_LINEAR, errorCallback, true)
                || extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_FLOAT_LINEAR, errorCallback, true);
            if (!extension) {
                //TODO: add a fallback that does this filtering in the frag shader?.
                filter = 'NEAREST';
            }
        }
        if (type === 'float32') {
            var extension = extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_FLOAT_LINEAR, errorCallback, true);
            if (!extension) {
                //TODO: add a fallback that does this filtering in the frag shader?.
                filter = 'NEAREST';
            }
        }
        return filter;
    };
    DataLayer.checkType = function (gl, type, writable, errorCallback) {
        // Check if float32 supported.
        if (!utils_1.isWebGL2(gl)) {
            if (type === 'float32') {
                var extension = extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_FLOAT, errorCallback, true);
                if (!extension) {
                    type = 'float16';
                }
                // https://stackoverflow.com/questions/17476632/webgl-extension-support-across-browsers
                // Rendering to a floating-point texture may not be supported,
                // even if the OES_texture_float extension is supported.
                // Typically, this fails on current mobile hardware.
                // To check if this is supported, you have to call the WebGL
                // checkFramebufferStatus() function.
                if (writable) {
                    var valid = DataLayer.testFramebufferWrite(gl, type);
                    if (!valid) {
                        type = 'float16';
                    }
                }
            }
            // Must support at least half float if using a float type.
            if (type === 'float16') {
                extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_HALF_FLOAT, errorCallback);
                if (writable) {
                    var valid = DataLayer.testFramebufferWrite(gl, type);
                    if (!valid) {
                        errorCallback("This browser does not support rendering to half-float textures.");
                    }
                }
            }
        }
        // Load additional extensions if needed.
        if (utils_1.isWebGL2(gl) && (type === 'float16' || type === 'float32')) {
            extensions_1.getExtension(gl, extensions_1.EXT_COLOR_BUFFER_FLOAT, errorCallback);
        }
        return type;
    };
    DataLayer.prototype.checkDataArray = function (_data) {
        if (!_data) {
            return;
        }
        var _a = this, width = _a.width, height = _a.height, length = _a.length, numComponents = _a.numComponents, glNumChannels = _a.glNumChannels, type = _a.type, name = _a.name;
        // Check that data is correct length.
        // First check for a user error.
        if ((length && _data.length !== length * numComponents) || (!length && _data.length !== width * height * numComponents)) {
            throw new Error("Invalid data length " + _data.length + " for DataLayer " + name + " of size " + (length ? length : width + "x" + height) + "x" + numComponents + ".");
        }
        // Check that data is correct type.
        var invalidTypeFound = false;
        switch (type) {
            case 'float32':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Float32Array;
                break;
            case 'float16':
                // Since there is no Float16Array, we must us Uint16Array to init texture.
                // We will allow Float32Arrays to be passed in as well and do the conversion automatically.
                invalidTypeFound = invalidTypeFound || (_data.constructor !== Float32Array && _data.constructor !== Uint16Array);
                break;
            case 'uint8':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Uint8Array;
                break;
            case 'int8':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Int8Array;
                break;
            case 'uint16':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Uint16Array;
                break;
            case 'int16':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Int16Array;
                break;
            case 'uint32':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Uint32Array;
                break;
            case 'int32':
                invalidTypeFound = invalidTypeFound || _data.constructor !== Int32Array;
                break;
            default:
                throw new Error("Error initing " + name + ".  Unsupported type " + type + " for GLCompute.initDataLayer.");
        }
        if (invalidTypeFound) {
            throw new Error("Invalid TypedArray of type " + _data.constructor.name + " supplied to DataLayer " + name + " of type " + type + ".");
        }
        // Then check if array needs to be lengthened.
        // This could be because glNumChannels !== numComponents.
        // Or because length !== width * height.
        var data = _data;
        var imageSize = width * height * glNumChannels;
        if (data.length < imageSize) {
            switch (type) {
                case 'float32':
                    data = new Float32Array(imageSize);
                    break;
                case 'float16':
                    data = new Uint16Array(imageSize);
                    break;
                case 'uint8':
                    data = new Uint8Array(imageSize);
                    break;
                case 'int8':
                    data = new Int8Array(imageSize);
                    break;
                case 'uint16':
                    data = new Uint16Array(imageSize);
                    break;
                case 'int16':
                    data = new Int16Array(imageSize);
                    break;
                case 'uint32':
                    data = new Uint32Array(imageSize);
                    break;
                case 'int32':
                    data = new Int32Array(imageSize);
                    break;
                default:
                    throw new Error("Error initing " + name + ".  Unsupported type " + type + " for GLCompute.initDataLayer.");
            }
            // Fill new data array with old data.
            // We have to handle the case of Float16 specially.
            var handleFloat16 = type === 'float16' && _data.constructor === Float32Array;
            var view = handleFloat16 ? new DataView(data.buffer) : null;
            for (var i = 0, _len = _data.length / numComponents; i < _len; i++) {
                for (var j = 0; j < numComponents; j++) {
                    if (handleFloat16) {
                        float16_1.setFloat16(view, 2 * (i * glNumChannels + j), _data[i * numComponents + j], true);
                    }
                    else {
                        data[i * glNumChannels + j] = _data[i * numComponents + j];
                    }
                }
            }
        }
        return data;
    };
    DataLayer.getGLTextureParameters = function (gl, name, params, errorCallback) {
        // TODO: we may not want to support int and unsigned int textures
        // because they require modifications to the shader code:
        // https://stackoverflow.com/questions/55803017/how-to-select-webgl-glsl-sampler-type-from-texture-format-properties
        var numComponents = params.numComponents, type = params.type, writable = params.writable;
        // https://www.khronos.org/registry/webgl/specs/latest/2.0/#TEXTURE_TYPES_FORMATS_FROM_DOM_ELEMENTS_TABLE
        var glType, glFormat, glInternalFormat, glNumChannels;
        if (utils_1.isWebGL2(gl)) {
            glNumChannels = numComponents;
            // https://www.khronos.org/registry/webgl/extensions/EXT_color_buffer_float/
            // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texImage2D
            // The sized internal format RGBxxx are not color-renderable for some reason.
            // If numComponents == 3 for a writable texture, use RGBA instead.
            if (numComponents === 3 && writable) {
                glNumChannels = 4;
            }
            switch (glNumChannels) {
                case 1:
                    glFormat = gl.RED;
                    break;
                case 2:
                    glFormat = gl.RG;
                    break;
                case 3:
                    glFormat = gl.RGB;
                    break;
                case 4:
                    glFormat = gl.RGBA;
                    break;
                default:
                    throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
            }
            switch (type) {
                case 'float32':
                    glType = gl.FLOAT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R32F;
                            break;
                        case 2:
                            glInternalFormat = gl.RG32F;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB32F;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA32F;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                case 'float16':
                    glType = gl.HALF_FLOAT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R16F;
                            break;
                        case 2:
                            glInternalFormat = gl.RG16F;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB16F;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA16F;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                case 'int8':
                    glType = gl.BYTE;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R8I;
                            break;
                        case 2:
                            glInternalFormat = gl.RG8I;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB8I;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA8I;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                case 'uint8':
                    glType = gl.UNSIGNED_BYTE;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R8;
                            break;
                        case 2:
                            glInternalFormat = gl.RG8;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                case 'int16':
                    glType = gl.SHORT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R16I;
                            break;
                        case 2:
                            glInternalFormat = gl.RG16I;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB16I;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA16I;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                case 'uint16':
                    glType = gl.UNSIGNED_SHORT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R16UI;
                            break;
                        case 2:
                            glInternalFormat = gl.RG16UI;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB16UI;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA16UI;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                case 'int32':
                    glType = gl.INT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R32I;
                            break;
                        case 2:
                            glInternalFormat = gl.RG32I;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB32I;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA32I;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                case 'uint32':
                    glType = gl.UNSIGNED_INT;
                    switch (glNumChannels) {
                        case 1:
                            glInternalFormat = gl.R32UI;
                            break;
                        case 2:
                            glInternalFormat = gl.RG32UI;
                            break;
                        case 3:
                            glInternalFormat = gl.RGB32UI;
                            break;
                        case 4:
                            glInternalFormat = gl.RGBA32UI;
                            break;
                        default:
                            throw new Error("Unsupported glNumChannels " + glNumChannels + " for DataLayer " + name + ".");
                    }
                    break;
                default:
                    throw new Error("Unsupported type " + type + " for DataLayer " + name + ".");
            }
        }
        else {
            switch (numComponents) {
                // TODO: for read only textures in WebGL 1.0, we could use gl.ALPHA and gl.LUMINANCE_ALPHA here.
                case 1:
                case 2:
                case 3:
                    glFormat = gl.RGB;
                    glInternalFormat = gl.RGB;
                    glNumChannels = 3;
                    break;
                case 4:
                    glFormat = gl.RGBA;
                    glInternalFormat = gl.RGBA;
                    glNumChannels = 4;
                    break;
                default:
                    throw new Error("Unsupported numComponents " + numComponents + " for DataLayer " + name + ".");
            }
            // TODO: how to support signed ints, maybe cast as floats instead?
            switch (type) {
                case 'float32':
                    glType = gl.FLOAT;
                    break;
                case 'float16':
                    glType = extensions_1.getExtension(gl, extensions_1.OES_TEXTURE_HALF_FLOAT, errorCallback).HALF_FLOAT_OES;
                    break;
                case 'uint8':
                    glType = gl.UNSIGNED_BYTE;
                    break;
                // case 'int8':
                // 	glType = gl.BYTE;
                // 	break;
                case 'uint16':
                    extensions_1.getExtension(gl, extensions_1.WEBGL_DEPTH_TEXTURE, errorCallback);
                    glType = gl.UNSIGNED_SHORT;
                    break;
                // case 'int16':
                // 	glType = gl.SHORT;
                // 	break;
                case 'uint32':
                    extensions_1.getExtension(gl, extensions_1.WEBGL_DEPTH_TEXTURE, errorCallback);
                    glType = gl.UNSIGNED_INT;
                    break;
                // case 'int32':
                // 	glType = gl.INT;
                // 	break;
                default:
                    throw new Error("Unsupported type " + type + " for DataLayer " + name + ".");
            }
        }
        // Check for missing params.
        if (glType === undefined || glFormat === undefined || glInternalFormat === undefined) {
            throw new Error("Invalid type: " + type + " or numComponents " + numComponents + ".");
        }
        if (glNumChannels === undefined || numComponents < 1 || numComponents > 4) {
            throw new Error("Invalid numChannels: " + numComponents + ".");
        }
        return {
            glFormat: glFormat,
            glInternalFormat: glInternalFormat,
            glType: glType,
            glNumChannels: glNumChannels,
        };
    };
    DataLayer.testFramebufferWrite = function (gl, type, options) {
        if (options === void 0) { options = {}; }
        var texture = gl.createTexture();
        if (!texture) {
            return false;
        }
        gl.bindTexture(gl.TEXTURE_2D, texture);
        var wrapS = gl[options.wrapS || 'CLAMP_TO_EDGE'];
        var wrapT = gl[options.wrapT || 'CLAMP_TO_EDGE'];
        var filter = gl[options.filter || 'NEAREST'];
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        var _a = DataLayer.getGLTextureParameters(gl, 'test', {
            numComponents: options.numComponents || 1,
            writable: true,
            type: type,
        }, function () { }), glInternalFormat = _a.glInternalFormat, glFormat = _a.glFormat, glType = _a.glType;
        gl.texImage2D(gl.TEXTURE_2D, 0, glInternalFormat, options.width || 100, options.height || 100, 0, glFormat, glType, null);
        // Init a framebuffer for this texture so we can write to it.
        var framebuffer = gl.createFramebuffer();
        if (!framebuffer) {
            return false;
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        var status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        return status === gl.FRAMEBUFFER_COMPLETE;
    };
    DataLayer.prototype.initBuffers = function (_data) {
        var _a = this, numBuffers = _a.numBuffers, gl = _a.gl, width = _a.width, height = _a.height, glInternalFormat = _a.glInternalFormat, glFormat = _a.glFormat, glType = _a.glType, filter = _a.filter, wrapS = _a.wrapS, wrapT = _a.wrapT, writable = _a.writable, errorCallback = _a.errorCallback;
        var data = this.checkDataArray(_data);
        // Init a texture for each buffer.
        for (var i = 0; i < numBuffers; i++) {
            var texture = gl.createTexture();
            if (!texture) {
                errorCallback("Could not init texture for DataLayer " + this.name + ": " + gl.getError() + ".");
                return;
            }
            gl.bindTexture(gl.TEXTURE_2D, texture);
            // TODO: are there other params to look into:
            // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texImage2D(gl.TEXTURE_2D, 0, glInternalFormat, width, height, 0, glFormat, glType, data ? data : null);
            var buffer = {
                texture: texture,
            };
            if (writable) {
                // Init a framebuffer for this texture so we can write to it.
                var framebuffer = gl.createFramebuffer();
                if (!framebuffer) {
                    errorCallback("Could not init framebuffer for DataLayer " + this.name + ": " + gl.getError() + ".");
                    return;
                }
                gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
                // https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/framebufferTexture2D
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
                var status_1 = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
                if (status_1 != gl.FRAMEBUFFER_COMPLETE) {
                    errorCallback("Invalid status for framebuffer for DataLayer " + this.name + ": " + status_1 + ".");
                }
                // Add framebuffer.
                buffer.framebuffer = framebuffer;
            }
            // Save this buffer to the list.
            this.buffers.push(buffer);
        }
        // Unbind.
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    };
    DataLayer.prototype.getCurrentStateTexture = function () {
        return this.buffers[this.bufferIndex].texture;
    };
    DataLayer.prototype.bindOutputBuffer = function (incrementBufferIndex) {
        var gl = this.gl;
        if (incrementBufferIndex) {
            // Increment bufferIndex.
            this.bufferIndex = (this.bufferIndex + 1) % this.numBuffers;
        }
        var framebuffer = this.buffers[this.bufferIndex].framebuffer;
        if (!framebuffer) {
            throw new Error("DataLayer " + this.name + " is not writable.");
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    };
    DataLayer.prototype.resize = function (dimensions, data) {
        if (!isNaN(dimensions)) {
            if (!this.length) {
                throw new Error("Invalid dimensions " + dimensions + " for 2D DataLayer " + this.name + ", please specify a width and height as an array.");
            }
            this.length = dimensions;
            var _a = this.calcWidthHeight(this.length), width = _a[0], height = _a[1];
            this.width = width;
            this.height = height;
        }
        else {
            if (this.length) {
                throw new Error("Invalid dimensions " + dimensions + " for 1D DataLayer " + this.name + ", please specify a length as a number.");
            }
            this.width = dimensions[0];
            this.height = dimensions[1];
        }
        this.destroyBuffers();
        this.initBuffers(data);
    };
    DataLayer.prototype.clear = function () {
        // Reset everything to zero.
        // This is not the most efficient way to do this (reallocating all textures and framebuffers).
        // but ok for now.
        this.destroyBuffers();
        this.initBuffers();
    };
    DataLayer.prototype.getDimensions = function () {
        return {
            width: this.width,
            height: this.height,
        };
    };
    DataLayer.prototype.getLength = function () {
        if (!this.length) {
            throw new Error("Cannot call getLength() on 2D DataLayer " + this.name + ".");
        }
        return this.length;
    };
    DataLayer.prototype.getNumComponent = function () {
        return this.numComponents;
    };
    DataLayer.prototype.getType = function () {
        return this.type;
    };
    DataLayer.prototype.destroyBuffers = function () {
        var _a = this, gl = _a.gl, buffers = _a.buffers;
        buffers.forEach(function (buffer) {
            var framebuffer = buffer.framebuffer, texture = buffer.texture;
            gl.deleteTexture(texture);
            if (framebuffer) {
                gl.deleteFramebuffer(framebuffer);
            }
            // @ts-ignore
            delete buffer.texture;
            delete buffer.framebuffer;
        });
        buffers.length = 0;
    };
    DataLayer.prototype.destroy = function () {
        this.destroyBuffers();
        // @ts-ignore
        delete this.gl;
        // @ts-ignore
        delete this.errorCallback;
    };
    return DataLayer;
}());
exports.DataLayer = DataLayer;
//# sourceMappingURL=DataLayer.js.map