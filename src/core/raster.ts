import Buffer from "./buffer"
import { Matrix } from "./math/matrix"
import { Vector } from "./math/vector"
import { Color, Colors } from "./mesh/color"
import Texture, { UV } from "./mesh/texture"
import { Vertex } from "./mesh/vertex"
import Utils from "./utils"


export interface Camera {
    view: Matrix,
    projection:Matrix,
    vp:Matrix //projection*view
}


export default class Raster {
    public width:number 
    public height:number
    // public frameBuffer:Uint8Array = null
    protected buffer:Buffer = null
    protected backgroundColor:Color = Colors.clone(Colors.BLACK)
    protected activeTexture:Texture = null
    protected usingMSAA:boolean = true //使用2x2 grid的MSAA抗锯齿

    protected camera:Camera = {
        view: new Matrix(),
        projection: new Matrix(),
        vp: new Matrix()
    }

    constructor(width:number, height:number, usingMSAA:boolean=true) {
        this.width = width
        this.height = height
        this.usingMSAA = usingMSAA

        this.buffer = new Buffer(width, height, usingMSAA)

        this.setDefaultCamera()
    }

    public clear() {
        this.buffer.clear(this.backgroundColor)
    }

    public drawLine(x0:number, y0:number, x1:number, y1:number, color:Color){
        if (x0 == x1) {
            let dir = y0 < y1 ? 1 : -1
            for (let y=y0; y!=y1; y+=dir) {
                this.setPixel(x0, y, color)
            }
            this.setPixel(x1, y1, color)
        } else if (y0 == y1) {
            let dir = x0 < x1 ? 1 : -1
            for (let x=x0; x!=x1; x+=dir) {
                this.setPixel(x, y0, color)
            }
            this.setPixel(x1, y1, color)
        } else {
            //use mid-point algorithm to draw line, <CG> 4th, Setion 8.1
            let dx = Math.abs(x1 - x0)
            let dy = Math.abs(y1 - y0)
            if (dx > dy) {
                //more horizontal line
                if (x0 > x1) {
                    let tx = x0, ty = y0
                    x0 = x1, y0 = y1
                    x1 = tx, y1 = ty
                }
                let dir = y1 > y0 ? 1: -1
                let y = y0
                let d = (y0-y1)*(x0+1) + (x1-x0)*(y0+0.5*dir) + x0*y1 - x1*y0
                for (let x=x0;x<=x1;x++) {
                    this.setPixel(x, y, color)
                    if (d*dir < 0){
                        y += dir
                        d += (x1-x0)*dir + (y0-y1)
                    } else {
                        d += y0 - y1
                    }
                }
            } else {
                //more vertical line
                if (y0 > y1) {
                    let tx = x0, ty = y0
                    x0 = x1, y0 = y1
                    x1 = tx, y1 = ty
                }
                let dir = x1 > x0 ? 1: -1
                let x = x0
                let d = (y0-y1)*(x0+0.5*dir) + (x1-x0)*(y0+1) + x0*y1 - x1*y0
                for (let y=y0;y<=y1;y++) {
                    this.setPixel(x, y, color)
                    if (d*dir > 0){
                        x += dir
                        d += (x1-x0)+ (y0-y1)*dir 
                    } else {
                        d += x1 - x0
                    }
                }
            }
        }
    }

    protected barycentricFunc(vs:Array<Vector>, a:number, b:number, x:number, y:number):number{
        return ((vs[a].y - vs[b].y)*x + (vs[b].x - vs[a].x)*y + vs[a].x*vs[b].y - vs[b].x*vs[a].y)
    }

    //如果在三角形内，返回[3个重心坐标], 否则返回null
    protected getBarycentricInTriangle(x:number, y:number, vs:Array<Vector>, fAlpha:number, fBelta:number, fGama:number,
        fAlphaTest:number, fBeltaTest:number, fGamaTest:number) {
        //F(a,b, x,y) = (ya-yb)*x + (xb-xa)*y + xa*yb - xb*ya, 
        //a,b is [0,1,2], belta= F(2,0,x,y) / F(2, 0, x1,y1)
        let belta = this.barycentricFunc(vs, 2, 0, x, y) / fBelta
        let gama = this.barycentricFunc(vs, 0, 1, x, y) / fGama
        let alpha = 1 - belta - gama
        if (alpha>=0 && belta >=0 && gama >=0) {
            if (  (alpha > 0 || fAlpha*fAlphaTest > 0) 
            &&  (belta > 0 || fBelta*fBeltaTest > 0) 
            &&  (gama > 0 || fGama*fGamaTest > 0) 
                ){
                return [ alpha, belta, gama]
            }
        }
        return null
    }

    public drawTriangle2D(v0:Vertex, v1:Vertex, v2:Vertex) {
        //使用重心坐标的算法(barycentric coordinates)对三角形进行光栅化
        //使用AABB来优化性能
        //对于三角形边(edge case)上的点, 使用的是<CG 4th>上的算法， 使用一个Off-screen point(-1, -1) 来判断是否在同一边
        let vs = [v0.posScreen, v1.posScreen, v2.posScreen]
        let x0 = vs[0].x, x1 = vs[1].x, x2 = vs[2].x, y0 = vs[0].y, y1=vs[1].y, y2=vs[2].y
        let minX = Math.floor( Math.min(x0, x1, x2) )
        let maxX = Math.ceil( Math.max(x0, x1, x2) )
        let minY = Math.floor( Math.min(y0, y1, y2) )
        let maxY = Math.ceil( Math.max(y0, y1, y2) )
        let fBelta = this.barycentricFunc(vs, 2, 0, x1, y1)
        let fGama = this.barycentricFunc(vs, 0, 1, x2, y2)
        let fAlpha =  this.barycentricFunc(vs, 1, 2, x0, y0)

        let offScreenPointX = -1, offScreenPointY = -1
        let fAlphaTest = this.barycentricFunc(vs, 1, 2, offScreenPointX, offScreenPointY)
        let fGamaTest = this.barycentricFunc(vs, 0, 1, offScreenPointX, offScreenPointY)
        let fBeltaTest = this.barycentricFunc(vs, 2, 0, offScreenPointX, offScreenPointY)

        for (let x=minX;x<=maxX;x++) {
            for (let y=minY;y<=maxY;y++) {
                if (!this.usingMSAA) {
                    this.rasterizePixelInTriangle(x, y, vs, v0, v1, v2, fAlpha, fBelta, fGama, fAlphaTest, fBeltaTest, fGamaTest)
                } else {
                    this.rasterizePixelInTriangleMSAA(x, y, vs, v0, v1, v2, fAlpha, fBelta, fGama, fAlphaTest, fBeltaTest, fGamaTest)
                }
            }
        }
    }

    protected rasterizePixelInTriangle(x:number, y:number, vs:Array<Vector>, v0:Vertex, v1:Vertex, v2:Vertex,
        fAlpha:number, fBelta:number, fGama:number, fAlphaTest:number, fBeltaTest:number, fGamaTest:number) {
        let barycentric = this.getBarycentricInTriangle(x, y, vs, fAlpha, fBelta, fGama, fAlphaTest, fBeltaTest, fGamaTest)
        if (barycentric == null) {
            return
        }
        let rhw = Utils.getInterpValue3(v0.rhw, v1.rhw, v2.rhw, barycentric[0], barycentric[1], barycentric[2]) //1/z
        //这里使用rhw=1/w作为深度缓冲的值，非线性的zbuffer在近处有更高的精度
        if (this.buffer.ztest(x, y, rhw)) {
            let w = 1 / (rhw != 0 ? rhw : 1)
            //反推3D空间中的重心坐标  a, b, c
            let a = barycentric[0]*w*v0.rhw
            let b = barycentric[1]*w*v1.rhw
            let c = barycentric[2]*w*v2.rhw
            let tempColor:Color = Colors.clone(Colors.WHITE)
            let uv:UV = {u:0, v:0}
            Colors.getInterpColor(v0.color, v1.color, v2.color, a, b, c, tempColor)
            Utils.getInterpUV(v0.uv, v1.uv, v2.uv, a, b, c, uv)
            let finalColor = this.fragmentShading(x, y, tempColor, uv)
            if (finalColor.a > 0) {
                this.setPixel(x, y, finalColor)
                this.buffer.setZ(x, y, rhw)
            }
        }
    }

    protected rasterizePixelInTriangleMSAA(x:number, y:number, vs:Array<Vector>, v0:Vertex, v1:Vertex, v2:Vertex,
        fAlpha:number, fBelta:number, fGama:number, fAlphaTest:number, fBeltaTest:number, fGamaTest:number) {
        //4个子采样点, 2x2 RGSS GRID  
        let points = [[x-0.325,y+0.125],[x+0.125, y+0.325],[x-0.125, y-0.325],[x+0.325,y-0.125]] 
        let testResults:Array<{barycentric:number[],index:number,x:number,y:number,rhw:number}> = []  
        for (let i=0;i<points.length;i++) {
            let p = points[i]
            let px:number = p[0], py:number=p[1]
            let barycentric = this.getBarycentricInTriangle(px, py, vs, fAlpha, fBelta, fGama, fAlphaTest, fBeltaTest, fGamaTest)
            if (barycentric != null) {
                let rhw = Utils.getInterpValue3(v0.rhw, v1.rhw, v2.rhw, barycentric[0], barycentric[1], barycentric[2]) //1/z
                if (this.buffer.ztest(x, y, rhw, i)) {
                    testResults.push({
                            barycentric: barycentric, 
                            index:i, 
                            x: x, 
                            y: y, 
                            rhw:rhw
                        }
                    )
                }
            }
        } 
        if (testResults.length > 0) {
            //对像素中心点进行一次frag着色,如果取不到，则使用第一个采样点进行着色
            let fx = x, fy = y
            let barycentric = this.getBarycentricInTriangle(x, y, vs, fAlpha, fBelta, fGama, fAlphaTest, fBeltaTest, fGamaTest)
            if (barycentric == null) {
                barycentric = testResults[0].barycentric
                fx = testResults[0].x
                fy = testResults[0].y
            }
            let rhw = Utils.getInterpValue3(v0.rhw, v1.rhw, v2.rhw, barycentric[0], barycentric[1], barycentric[2]) //1/z
            let w = 1 / (rhw != 0 ? rhw : 1)
            let a = barycentric[0]*w*v0.rhw
            let b = barycentric[1]*w*v1.rhw
            let c = barycentric[2]*w*v2.rhw
            let tempColor:Color = Colors.clone(Colors.WHITE)
            let uv:UV = {u:0, v:0}
            Colors.getInterpColor(v0.color, v1.color, v2.color, a, b, c, tempColor)
            Utils.getInterpUV(v0.uv, v1.uv, v2.uv, a, b, c, uv)
            let finalColor = this.fragmentShading(fx, fy, tempColor, uv)
            if (finalColor.a > 0) {
                for (let result of testResults) {
                    let index = result.index
                    let rhw = result.rhw
                    this.setPixel(x, y, finalColor, index)
                    this.buffer.setZ(x, y, rhw, index)
                }
                this.buffer.applyMSAAFilter(x, y)
            }
        }
    }
    //片元着色
    protected fragmentShading(x:number, y:number, color:Color, uv:UV) {
        if (this.activeTexture != null) {
            let tex = this.activeTexture.sample(uv)
            return Colors.multiplyColor(tex, color, tex)
        } 
        return color
    }

    public setActiveTexture(texture:Texture) {
        this.activeTexture = texture
    }

    public setBackgroundColor(color:Color) {
        this.backgroundColor = Colors.clone(color)
    }

    public setPixel(x:number, y:number, color:Color, index:number=0) {
        if (x < this.width && y < this.height && x>=0 && y>=0) {
            this.buffer.setColor(x, y, color, index)
        }
        
    }
    //va is array of vertex, elements is triangles using vertex index in va
    public drawElements(va:Array<Vertex>, elements:Array<number>) {
        //根据当前的view和project, 对所有三角形进行投影计算
        //对每一个三角形进行光栅化， 然后进行着色，zbuffer和framebuffer赋值
        //没做backface culling, 只做了view volumn culling
        //三角形细分的clip没做
        if (elements.length % 3 != 0){
            return
        }
        let cameraTransform = this.camera.vp
        for (let vert of va) {
            if (vert.posProject == null) {
                vert.posProject = new Vector()
            }
            vert.posWorld.transform(cameraTransform, vert.posProject)
            vert.rhw = 1/vert.posProject.w //w等同于投影前的视图坐标的z
            vert.posProject.homogenenize()
            if (Utils.isInsideViewVolumn(vert.posProject)){
                if (vert.posScreen == null){
                    vert.posScreen = new Vector()
                }
                Utils.convertToScreenPos(vert.posProject, vert.posScreen, this.width, this.height)
            }
        }
        for (let i=0;i<elements.length;i+=3) {
            let trianglePoints = [va[elements[i]], va[elements[i+1]], va[elements[i+2]]]
            let culling = false
            for (let p of trianglePoints) {
                //view volumn culling
                if (!Utils.isInsideViewVolumn(p.posProject) ) {
                    culling = true
                    break;
                }
            }
            if (!culling) {
                this.drawTriangle2D(trianglePoints[0], trianglePoints[1], trianglePoints[2])
            }
        }
    }

    protected setDefaultCamera() {
        let eye = new Vector(1.5, 0, 3, 1)
        let at = new Vector(0, 0, 0, 1)
        let up = new Vector(0, 1, 0, 1)
        let fovy = Math.PI / 2
        let aspect = this.width / this.height
        let near = 1
        let far = 500
        this.setCamera(eye, at, up, fovy, aspect, near, far)
    }

    public setCamera(eye:Vector, lookAt:Vector, up:Vector, fovy:number, aspect:number, near:number, far:number) {
        this.camera.view.setLookAt(eye, lookAt, up)
        this.camera.projection.setPerspective(fovy, aspect, near, far)
        this.camera.vp = this.camera.view.multiply(this.camera.projection)
    }

    public getFrameBuffer() {
        return this.buffer.frameBuffer
    }
}
