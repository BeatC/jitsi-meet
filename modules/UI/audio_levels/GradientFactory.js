/**
 * Factory methods for gradients
 **/

class GradientFactory {
    constructor(ctx, colors) {
        this.ctx = ctx;
        this.colors = colors || [];
    }
    /**
     * Factory method returning radial gradient
     */
    createRadialGradient(center, inner, outer) {
        let x = center.x;
        let y = center.y;
        let ctx = this.ctx;
        let gradient = ctx.createRadialGradient(x, y, inner, x, y, outer);
        this.colors.forEach((el, i) => {
            gradient.addColorStop(i, el);
        });

        return gradient;
    }
}

export default GradientFactory;