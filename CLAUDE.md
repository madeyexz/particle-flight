# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Particle Flight is an infinite terrain flight simulator built with Three.js. It features procedurally generated terrain rendered as particles, physics-based flight controls inspired by BF2042, and a fighter jet-style HUD.

## Commands

```bash
pnpm dev      # Start dev server (port 3001, auto-opens browser)
pnpm build    # Build production bundle to /dist
pnpm preview  # Preview production build
```

## Architecture

**Tech Stack:** Three.js + Vite + Vanilla JavaScript (ES modules) + Custom GLSL shaders

### Core Modules

- **main.js** - Entry point, game loop, HUD updates, input events, settings panel
- **terrain.js** - Procedural terrain via Simplex noise with 200k particles, custom vertex/fragment shaders for distance fog and height-based coloring
- **airplane.js** - Paper airplane model using BufferGeometry with triple rendering (solid mesh + wireframe + edge lines)
- **controls.js** - Flight physics engine with angular momentum model, bank-to-turn mechanics, afterburner system, 3 camera modes
- **effects.js** - Visual effects (sonar ping ring, particle bursts)

### Flight Physics (controls.js)

The flight controller implements sophisticated mechanics:
- Angular momentum with rotational inertia and damping
- Bank-to-turn: rolling generates automatic yaw
- Speed-dependent handling and turn speed bleed
- G-force simulation from angular intensities
- Gravity/lift model with ground collision detection

### Terrain System (terrain.js)

Infinite terrain using particle-based rendering:
- Custom Simplex noise implementation with FBM (fractal Brownian motion)
- Particles update positions based on player movement
- GLSL shaders handle fog, height coloring, and size attenuation

### HUD (index.html + styles.css)

Fighter jet aesthetic with:
- Speed/altitude tapes (vertical scrolling)
- Pitch ladder with horizon line
- Roll indicator arc
- Heading compass
- G-force, throttle, and afterburner displays
