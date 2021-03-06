var WebGLBlitter = (function () {
    function WebGLBlitter(gl) {
        this.gl = gl;
        this.initShader();
        this.initTexture();
        this.initGeometry();
    }
    WebGLBlitter.prototype.initTexture = function () {
        var gl = this.gl;
        this.canvasTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.canvasTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    };
    WebGLBlitter.prototype.initShader = function () {
        var gl = this.gl;
        var vertexShaderSource = "attribute vec4 a_Position;" +
            "attribute vec2 a_TexCoord;" +
            "varying vec2 v_TexCoord;" +
            "void main(){" +
            "gl_Position = a_Position;" +
            "v_TexCoord = a_TexCoord;" +
            "}";
        var fragmentShaderSource = "precision mediump float;" +
            "    uniform sampler2D u_Sampler;" +
            "    varying vec2 v_TexCoord;" +
            "    void main(){" +
            "        gl_FragColor = texture2D(u_Sampler, v_TexCoord);" +
            "}";
        var vertShader = gl.createShader(gl.VERTEX_SHADER);
        gl.shaderSource(vertShader, vertexShaderSource);
        gl.compileShader(vertShader);
        var fragShader = gl.createShader(gl.FRAGMENT_SHADER);
        gl.shaderSource(fragShader, fragmentShaderSource);
        gl.compileShader(fragShader);
        this.shaderProgram = gl.createProgram();
        gl.attachShader(this.shaderProgram, vertShader);
        gl.attachShader(this.shaderProgram, fragShader);
        gl.linkProgram(this.shaderProgram);
        this.u_Sampler = gl.getUniformLocation(this.shaderProgram, "u_Sampler");
    };
    WebGLBlitter.prototype.initGeometry = function () {
        var gl = this.gl;
        var vertexs = new Float32Array([
            -1, 1, 0.0, 0.0, 1.0,
            -1, -1, 0.0, 0.0, 0.0,
            1, 1, 0.0, 1.0, 1.0,
            1, -1, 0.0, 1.0, 0.0]);
        this.vertexsBuffer = gl.createBuffer();
        if (this.vertexsBuffer === null) {
            console.log("vertexsBuffer is null");
            return false;
        }
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexsBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, vertexs, gl.STATIC_DRAW);
        var a_Position = gl.getAttribLocation(this.shaderProgram, "a_Position");
        if (a_Position < 0) {
            console.log("a_Position < 0");
            return false;
        }
        var a_TexCoord = gl.getAttribLocation(this.shaderProgram, "a_TexCoord");
        if (a_TexCoord < 0) {
            console.log("a_TexCoord < 0");
            return false;
        }
        gl.vertexAttribPointer(a_Position, 3, gl.FLOAT, false, vertexs.BYTES_PER_ELEMENT * 5, 0);
        gl.enableVertexAttribArray(a_Position);
        gl.vertexAttribPointer(a_TexCoord, 2, gl.FLOAT, false, vertexs.BYTES_PER_ELEMENT * 5, vertexs.BYTES_PER_ELEMENT * 3);
        gl.enableVertexAttribArray(a_TexCoord);
    };
    WebGLBlitter.prototype.renderCanvas = function () {
        var gl = this.gl;
        gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.shaderProgram);
        gl.uniform1i(this.u_Sampler, 0);
        gl.activeTexture(this.gl.TEXTURE0);
        gl.bindTexture(this.gl.TEXTURE_2D, this.canvasTexture);
        gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);
    };
    WebGLBlitter.prototype.blitPixels = function (width, height, pixels) {
        this.gl.bindTexture(this.gl.TEXTURE_2D, this.canvasTexture);
        this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.renderCanvas();
    };
    return WebGLBlitter;
})();
exports.WebGLBlitter = WebGLBlitter;
//# sourceMappingURL=webgl-blitter.js.map