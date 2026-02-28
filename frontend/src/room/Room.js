import * as PIXI from 'pixi.js';
import { cartToIso, TILE_WIDTH, TILE_HEIGHT } from '../utils/isometric.js';

export const GRID_SIZE = 12;

const COL = {
    bg:    0x1a1a2e,
    floor: 0x16213e,
    floorLine: 0x1e2a50,
    wallLeft:  0x0f3460,
    wallRight: 0x0a2a50,
    wallEdge:  0x1a4a80,
};

export class Room {
    constructor(stage) {
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this.floorContainer = new PIXI.Container();
        this.wallContainer  = new PIXI.Container();
        this.container.addChild(this.floorContainer);
        this.container.addChild(this.wallContainer);

        this._drawFloor();
        this._drawWalls();
        this._drawClock();
    }

    gridToScreen(gx, gy) {
        const iso = cartToIso(gx, gy);
        return {
            x: iso.x + window.innerWidth / 2,
            y: iso.y + window.innerHeight / 2 - (GRID_SIZE * TILE_HEIGHT / 2)
        };
    }

    _drawFloor() {
        for (let gx = 0; gx < GRID_SIZE; gx++) {
            for (let gy = 0; gy < GRID_SIZE; gy++) {
                const tile = new PIXI.Graphics();
                const { x, y } = this.gridToScreen(gx, gy);

                const shade = (gx + gy) % 2 === 0 ? COL.floor : COL.floorLine;
                tile.beginFill(shade, 1);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();
                tile.endFill();

                tile.lineStyle(1, 0x1e2a5a, 0.5);
                tile.moveTo(x, y);
                tile.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.lineTo(x, y + TILE_HEIGHT);
                tile.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
                tile.closePath();

                this.floorContainer.addChild(tile);
            }
        }
    }

    _drawWalls() {
        const wallH  = 120;
        const baseH  = 5;
        const railY  = wallH * 0.30;

        for (let gy = 0; gy < GRID_SIZE; gy++) {
            const { x, y } = this.gridToScreen(0, gy);
            const panel = new PIXI.Graphics();

            panel.beginFill(COL.wallLeft);
            panel.moveTo(x, y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            panel.beginFill(0x1a4878, 0.55);
            panel.moveTo(x,                  y);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            panel.lineStyle(0.8, 0x1a5a90, 0.35);
            panel.moveTo(x,                  y - railY);
            panel.lineTo(x - TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - railY);

            panel.lineStyle(1, COL.wallEdge, 0.6);
            panel.moveTo(x, y - wallH);
            panel.lineTo(x, y);

            this.wallContainer.addChild(panel);
        }

        for (let gx = 0; gx < GRID_SIZE; gx++) {
            const { x, y } = this.gridToScreen(gx, 0);
            const panel = new PIXI.Graphics();

            panel.beginFill(COL.wallRight);
            panel.moveTo(x, y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - wallH);
            panel.lineTo(x, y - wallH);
            panel.closePath();
            panel.endFill();

            panel.beginFill(0x0f3a60, 0.5);
            panel.moveTo(x,                  y);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2);
            panel.lineTo(x + TILE_WIDTH / 2, y + TILE_HEIGHT / 2 - baseH);
            panel.lineTo(x,                  y - baseH);
            panel.closePath();
            panel.endFill();

            panel.lineStyle(1, COL.wallEdge, 0.4);
            panel.moveTo(x, y - wallH);
            panel.lineTo(x, y);

            this.wallContainer.addChild(panel);
        }

        const { x: cx, y: cy } = this.gridToScreen(0, 0);
        const corner = new PIXI.Graphics();
        corner.lineStyle(2, COL.wallEdge, 0.9);
        corner.moveTo(cx, cy - wallH);
        corner.lineTo(cx, cy);
        this.wallContainer.addChild(corner);
    }

    _drawClock() {
        const wallH = 120;
        const { x: wx, y: wy } = this.gridToScreen(6, 0);
        const cx = wx + TILE_WIDTH  / 4;
        const cy = wy + TILE_HEIGHT / 4 - wallH * 0.62;

        const screen = new PIXI.Graphics();
        screen.beginFill(0x050d18);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);
        screen.endFill();

        screen.lineStyle(1, 0x0d3050, 0.9);
        screen.drawRoundedRect(-38, -14, 76, 28, 5);

        screen.lineStyle(0.6, 0x0088cc, 0.28);
        screen.moveTo(-36, -13);
        screen.lineTo( 36, -13);

        screen.lineStyle(0);
        screen.beginFill(0x081525);
        for (const [sx, sy] of [[-34, -11], [34, -11], [-34, 11], [34, 11]]) {
            screen.drawCircle(sx, sy, 1.5);
        }
        screen.endFill();

        this._clockText = new PIXI.Text('00:00', {
            fontFamily:         'monospace',
            fontSize:           16,
            fill:               0x00e0ff,
            fontWeight:         'bold',
            letterSpacing:      3,
            dropShadow:         true,
            dropShadowColor:    '#00aaff',
            dropShadowBlur:     10,
            dropShadowDistance: 0,
            dropShadowAlpha:    0.85,
        });
        this._clockText.anchor.set(0.5, 0.5);
        this._clockText.y = 1;

        const clockContainer = new PIXI.Container();
        clockContainer.addChild(screen);
        clockContainer.addChild(this._clockText);
        clockContainer.x = cx;
        clockContainer.y = cy;
        clockContainer.skew.y = Math.atan2(TILE_HEIGHT / 2, TILE_WIDTH / 2);

        this.wallContainer.addChild(clockContainer);

        this._updateClock();
        setInterval(() => this._updateClock(), 1000);
    }

    _updateClock() {
        if (!this._clockText) return;
        const now = new Date();
        const hh  = String(now.getHours()).padStart(2, '0');
        const mm  = String(now.getMinutes()).padStart(2, '0');
        this._clockText.text = `${hh}:${mm}`;
    }

    getTileCenter(gx, gy) {
        const { x, y } = this.gridToScreen(gx, gy);
        return { x, y: y + TILE_HEIGHT / 2 };
    }
}
