declare module 'canvas2svg' {
  class C2S extends CanvasRenderingContext2D {
    constructor(width: number, height: number)
    getSerializedSvg(fixNamedEntities?: boolean): string
  }
  export default C2S
}
