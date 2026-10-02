// Translates mouse drag / touch drag / keyboard into horizontal steering.
export class Input {
  constructor(target) {
    this.dragDelta = 0; // accumulated world-units of drag since last consume
    this.keys = new Set();
    this.dragging = false;
    this.lastX = 0;
    this.onPause = null;

    target.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.lastX = e.clientX;
      target.setPointerCapture?.(e.pointerId);
    });
    target.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.lastX;
      this.lastX = e.clientX;
      // Full screen width of drag ≈ 1.6 road widths, feels like the mobile original.
      const width = Math.min(window.innerWidth, window.innerHeight * 1.2);
      this.dragDelta += (dx / width) * 22;
    });
    const end = () => (this.dragging = false);
    target.addEventListener('pointerup', end);
    target.addEventListener('pointercancel', end);

    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) this.onPause();
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.dragging = false;
    });
  }

  get axis() {
    let a = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) a -= 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) a += 1;
    return a;
  }

  consumeDrag() {
    const d = this.dragDelta;
    this.dragDelta = 0;
    return d;
  }
}
