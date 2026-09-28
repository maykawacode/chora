declare module 'svgcanvas' {
  export class Context {
    constructor(width: number, height: number)
    font: string
    getSvg(): SVGSVGElement
    getSerializedSvg(fixNamedEntities?: boolean): string
  }
}
