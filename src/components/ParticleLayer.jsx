import React, { useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const ParticleLayer = forwardRef(({ width = 800, height = 600, ballsRef }, ref) => {
  const canvasRef = useRef(null);
  const particlesRef = useRef([]);
  const trailsRef = useRef([]);
  const animationRef = useRef(null);

  useImperativeHandle(ref, () => ({
    spawnSparks: (x, y) => {
      const colors = ['#fcd34d', '#f59e0b', '#ef4444', '#ffffff'];
      for (let i = 0; i < 20; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = Math.random() * 3 + 2;
        particlesRef.current.push({
          x: x,
          y: y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 2,
          radius: Math.random() * 2 + 1,
          color: colors[Math.floor(Math.random() * colors.length)],
          life: 1.0,
          decay: Math.random() * 0.02 + 0.02
        });
      }
    }
  }));

  const animate = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    ctx.clearRect(0, 0, width, height);

    // Draw trails
    if (ballsRef && ballsRef.current) {
      ballsRef.current.forEach((ball, i) => {
        if (!trailsRef.current[i]) trailsRef.current[i] = [];
        const trail = trailsRef.current[i];

        // Only record trail if ball is moving
        if (ball.active && (ball.vx !== 0 || ball.vy !== 0)) {
          trail.push({ x: ball.x, y: ball.y });
          if (trail.length > 8) { // Keep last 8 positions for a short comet tail
            trail.shift();
          }
        } else {
          // Clear trail if stopped or inactive
          if (trail.length > 0) trail.length = 0;
        }

        // Render trail segments
        if (trail.length > 1) {
          for (let j = 0; j < trail.length - 1; j++) {
            ctx.beginPath();
            ctx.moveTo(trail[j].x, trail[j].y);
            ctx.lineTo(trail[j + 1].x, trail[j + 1].y);

            // Fade out towards the tail (j=0 is the oldest, j=length-1 is the newest)
            const alpha = (j / (trail.length - 1)) * 0.6;
            const thickness = ball.radius * 2 * (j / (trail.length - 1));

            ctx.strokeStyle = `rgba(239, 68, 68, ${alpha})`; // Red trail
            ctx.lineWidth = Math.max(thickness, 1);
            ctx.lineCap = 'round';
            ctx.stroke();
          }
        }
      });
    }

    const particles = particlesRef.current;
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];

      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.2;
      p.life -= p.decay;

      if (p.life <= 0) {
        particles.splice(i, 1);
        continue;
      }

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.life;
      ctx.fill();
      ctx.globalAlpha = 1.0;
    }

    animationRef.current = requestAnimationFrame(animate);
  };

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 5
      }}
    />
  );
});

export default ParticleLayer;
