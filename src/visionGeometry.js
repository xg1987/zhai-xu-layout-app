// SVG uses xMidYMid meet in a 310 × 310 square and a south-up display rotation.
export function recognitionToCanvas(result, width, height) {
 const factor=310/Math.max(width,height),w=width*factor,h=height*factor
 return {angle:result.northAngleDeg===null?null:(360-result.northAngleDeg)%360,points:result.outline.map(([x,y])=>[400+(x/1000-.5)*w,400+(y/1000-.5)*h])}
}
