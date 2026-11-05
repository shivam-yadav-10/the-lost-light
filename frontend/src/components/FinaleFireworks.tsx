import { useEffect, useRef } from 'react';

const COLOURS = ['#fde68a', '#fbbf24', '#fb923c', '#c4b5fd', '#f9a8d4'];

interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  colour: string;
}

export function FinaleFireworks() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 0;
    let height = 0;
    let frame = 0;
    let previous = 0;
    let nextBurst = 0;
    let burstIndex = 0;
    const sparks: Spark[] = [];

    function resize() {
      width = window.innerWidth;
      height = window.innerHeight;
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas!.width = Math.round(width * ratio);
      canvas!.height = Math.round(height * ratio);
      context!.setTransform(ratio, 0, 0, ratio, 0, 0);
      sparks.length = 0;
    }

    function animate(now: number) {
      frame = window.requestAnimationFrame(animate);
      if (now - previous < 1000 / 30) return;
      const elapsed = Math.min((now - previous) / 1000 || 1 / 30, .05);
      previous = now;
      context!.clearRect(0, 0, width, height);
      if (now >= nextBurst && sparks.length < 100) {
        const x = width * (burstIndex % 2 ? .78 : .22);
        const y = height * (.18 + (burstIndex % 3) * .1);
        const colour = COLOURS[burstIndex++ % COLOURS.length];
        for (let i = 0; i < 32; i++) {
          const angle = (i / 32) * Math.PI * 2;
          const speed = 45 + (i % 4) * 22;
          sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1.8, colour });
        }
        nextBurst = now + 1100;
      }
      context!.lineWidth = 1.7;
      context!.lineCap = 'round';
      for (let i = sparks.length - 1; i >= 0; i--) {
        const spark = sparks[i];
        spark.life -= elapsed;
        if (spark.life <= 0) { sparks.splice(i, 1); continue; }
        const x = spark.x;
        const y = spark.y;
        spark.x += spark.vx * elapsed;
        spark.y += spark.vy * elapsed;
        spark.vy += 28 * elapsed;
        context!.globalAlpha = Math.min(1, spark.life) * .75;
        context!.strokeStyle = spark.colour;
        context!.beginPath();
        context!.moveTo(x - spark.vx * .04, y - spark.vy * .04);
        context!.lineTo(spark.x, spark.y);
        context!.stroke();
      }
      context!.globalAlpha = 1;
    }

    function updatePlayback() {
      window.cancelAnimationFrame(frame);
      frame = 0;
      previous = 0;
      if (motion.matches || document.visibilityState !== 'visible') {
        sparks.length = 0;
        context!.clearRect(0, 0, width, height);
        return;
      }
      nextBurst = performance.now() + 700;
      frame = window.requestAnimationFrame(animate);
    }

    resize();
    updatePlayback();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', updatePlayback);
    motion.addEventListener('change', updatePlayback);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      document.removeEventListener('visibilitychange', updatePlayback);
      motion.removeEventListener('change', updatePlayback);
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="finale-fireworks pointer-events-none fixed inset-0 h-full w-full" />;
}
