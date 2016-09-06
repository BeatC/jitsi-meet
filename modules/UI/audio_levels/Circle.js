/**
 *  Class representing circle on the canvas
 **/

class Circle {
    constructor(ctx) {
        this.ctx = ctx;
    }

    /**
     * Drawing circle on the canvas
     */
    draw() {
        this.ctx.beginPath();
        this.ctx.arc(this.center.x, this.center.y, this.radius, 0, 2 * Math.PI);
        this.ctx.fillStyle = this.color;
        this.ctx.fill();
        this.ctx.closePath();
    }
}

export default Circle;