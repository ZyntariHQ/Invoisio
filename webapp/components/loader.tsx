"use client"

import React from "react"

export function Loader({ fullscreen = false }: { fullscreen?: boolean }) {
  return (
    <div className={fullscreen ? "nm-loader-overlay" : "nm-loader-inline"} aria-live="polite" aria-busy="true">
      <div className="loader" />
      <style jsx>{`
        .nm-loader-overlay {
          position: fixed;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100050;
          /* solid background to fully cover UI while loading */
          background: var(--nm-bg, #f0f3f7);
          pointer-events: all;
        }
        /* honor dark theme when present */
        :global(html.dark) .nm-loader-overlay {
          background: var(--nm-bg-dark, #0b0f14);
        }
        .nm-loader-inline {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loader {
          width: 48px;
          height: 48px;
          margin: auto;
          position: relative;
        }
        .loader:before {
          content: '';
          width: 48px;
          height: 5px;
          background: #999;
          position: absolute;
          top: 60px;
          left: 0;
          border-radius: 50%;
          animation: shadow324 0.5s linear infinite;
        }
        .loader:after {
          content: '';
          width: 100%;
          height: 100%;
          background: rgb(61, 106, 255);
          position: absolute;
          top: 0;
          left: 0;
          border-radius: 4px;
          animation: jump7456 0.5s linear infinite;
        }
        @keyframes jump7456 {
          15% { border-bottom-right-radius: 3px; }
          25% { transform: translateY(9px) rotate(22.5deg); }
          50% { transform: translateY(18px) scale(1, .9) rotate(45deg); border-bottom-right-radius: 40px; }
          75% { transform: translateY(9px) rotate(67.5deg); }
          100% { transform: translateY(0) rotate(90deg); }
        }
        @keyframes shadow324 {
          0%, 100% { transform: scale(1, 1); }
          50% { transform: scale(1.2, 1); }
        }
      `}</style>
    </div>
  )
}

export default Loader