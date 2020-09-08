
module.exports = class statistics {
    constructor() {
        this.max = 0
        this.min = Number.POSITIVE_INFINITY
        this.global_max = 0
        this.global_min = Number.POSITIVE_INFINITY
        this.count = 0
        this.acc = 0
    }
     add(c) {
        this.acc += c
        this.count++
        if(c < this.min) this.min = c
        if(c > this.max) this.max = c
    }
     get() {
        if(this.min < this.global_min) this.global_min = this.min
        if(this.max > this.global_max) this.global_max = this.max
        let r = {
            mean: this.acc/this.count,
            min: this.min,
            max: this.max,
            min_global: this.global_min,
            max_global: this.global_max
        }
        this.max = 0
        this.min = Number.POSITIVE_INFINITY
        this.acc = 0
        this.count = 0
        return r
    }
     clear() {
        this.global_max = 0
        this.global_min = Number.POSITIVE_INFINITY
    }
}