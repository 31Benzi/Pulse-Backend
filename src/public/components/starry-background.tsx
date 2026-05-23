import type { FC } from "hono/jsx";
import { useEffect, useRef } from "hono/jsx";
import "./../styles.css";

export const StarryBackground: FC = () => {
  return (
    <>
      <canvas
        id="starry-background"
        className="starry-background"
        aria-hidden="true"
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
          function initStarryBackground() {
            const canvas = document.getElementById('starry-background');
            if (!canvas) return;

            const ctx = canvas.getContext('2d');
            if (!ctx) return;

            function resizeCanvas() {
              canvas.width = window.innerWidth;
              canvas.height = window.innerHeight;
              drawStars();
            }

            function drawStars() {
              ctx.clearRect(0, 0, canvas.width, canvas.height);

              const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
              gradient.addColorStop(0, "#000000");
              gradient.addColorStop(1, "#121212");

              ctx.fillStyle = gradient;
              ctx.fillRect(0, 0, canvas.width, canvas.height);

              const starCount = Math.floor((canvas.width * canvas.height) / 1000);

              for (let i = 0; i < starCount; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const radius = Math.random() * 1.5;
                const opacity = Math.random();

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = \`rgba(255, 255, 255, \${opacity})\`;
                ctx.fill();
              }

              for (let i = 0; i < starCount / 50; i++) {
                const x = Math.random() * canvas.width;
                const y = Math.random() * canvas.height;
                const radius = 1 + Math.random() * 1.5;

                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
                ctx.fill();

                ctx.beginPath();
                ctx.arc(x, y, radius * 2, 0, Math.PI * 2);
                const glow = ctx.createRadialGradient(x, y, radius * 0.5, x, y, radius * 2);
                glow.addColorStop(0, "rgba(255, 255, 255, 0.3)");
                glow.addColorStop(1, "rgba(255, 255, 255, 0)");
                ctx.fillStyle = glow;
                ctx.fill();
              }
            }

            resizeCanvas();

            window.addEventListener("resize", resizeCanvas);
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initStarryBackground);
          } else {
            setTimeout(initStarryBackground, 0);
          }
        `,
        }}
      />
    </>
  );
};
