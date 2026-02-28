import * as PIXI from 'pixi.js';
import { EventEmitter } from '../utils/EventEmitter.js';

const HIGHLIGHT_COLOR = 0xe94560;

export class Furniture extends EventEmitter {
    constructor(stage, room) {
        super();
        this.room = room;
        this.container = new PIXI.Container();
        stage.addChild(this.container);

        this._items = [];
        this.acceptedInterventions = 0;

        this._animTick = 0;
        this._deskScanLine  = null;
        this._termCursor    = null;
        this._coffeeContainer   = null;
        this._coffeeSpawnAccum  = 0;
        this._steamParticles    = [];
        this._phoneNotifDot     = null;

        this._buildRoom();
    }

    _buildRoom() {
        this._addDesk(5, 2);
        this._addTerminal(7, 2);
        this._addSecondMonitor(2, 2);
        this._addWhiteboard(1, 4);
        this._addPhone(5, 3);
        this._addCoffeeMachine(1, 8);
        this._addPlant(10, 10);
        this._addSpeaker(8, 2);
        this._addChair(5, 4);
    }

    _addDesk(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x0f3460);
        g.drawRect(-40, -12, 80, 40);
        g.endFill();
        g.beginFill(0x0a2540);
        g.drawRect(-35, 28, 10, 28);
        g.drawRect(25, 28, 10, 28);
        g.endFill();
        g.lineStyle(1, 0x1e4a80, 0.8);
        g.drawRect(-40, -12, 80, 40);

        g.lineStyle(0);
        g.beginFill(0x0d0d1a);
        g.drawRect(-20, -46, 40, 30);
        g.endFill();
        g.beginFill(0x1a1a3e);
        g.drawRect(-18, -44, 36, 26);
        g.endFill();
        g.beginFill(0x001a0d);
        g.drawRect(-16, -43, 32, 23);
        g.endFill();
        g.lineStyle(1, 0x00ff41, 0.25);
        for (let i = 0; i < 4; i++) {
            const y = -40 + i * 5;
            const w = 14 + Math.floor(i * 3.5);
            g.moveTo(-14, y); g.lineTo(-14 + w, y);
        }
        g.lineStyle(0);
        g.beginFill(0x0a2040);
        g.drawRect(-4, -16, 8, 6);
        g.endFill();
        g.beginFill(0x0a1530);
        g.drawRoundedRect(-22, 10, 44, 10, 2);
        g.endFill();

        c.addChild(g);

        const monitorGlow = new PIXI.Graphics();
        monitorGlow.beginFill(0x2244cc, 0.07);
        monitorGlow.drawEllipse(0, 34, 88, 28);
        monitorGlow.endFill();
        c.addChildAt(monitorGlow, 0);

        this._deskScreenOverlay = new PIXI.Graphics();
        this._drawMonitorContent(this._deskScreenOverlay, 'RELAXED');
        c.addChild(this._deskScreenOverlay);

        const scanLine = new PIXI.Graphics();
        scanLine.beginFill(0x00ff41, 0.28);
        scanLine.drawRect(-14, 0, 30, 2);
        scanLine.endFill();
        scanLine.y = -43;
        c.addChild(scanLine);
        this._deskScanLine = scanLine;

        this._placeItem(c, gx, gy, 'desk_computer', true, 'code');
    }

    _addTerminal(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x0c2540);
        g.drawRect(-20, 0, 40, 16);
        g.endFill();
        g.beginFill(0x050505);
        g.drawRect(-18, -34, 36, 36);
        g.endFill();
        g.beginFill(0x001800);
        g.drawRect(-16, -32, 32, 32);
        g.endFill();
        g.lineStyle(1, 0x00ff41, 0.3);
        g.moveTo(-13, -28); g.lineTo(0, -28);
        g.moveTo(-13, -23); g.lineTo(6, -23);

        c.addChild(g);

        const cursor = new PIXI.Graphics();
        cursor.beginFill(0x00ff41, 0.9);
        cursor.drawRect(-13, -16, 8, 3);
        cursor.endFill();
        c.addChild(cursor);
        this._termCursor = cursor;

        this._placeItem(c, gx, gy, 'desk_terminal', true, 'terminal');
    }

    _addSecondMonitor(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x0a0a18);
        g.drawRect(-30, -50, 60, 40);
        g.endFill();
        g.beginFill(0x0d1a2e);
        g.drawRect(-27, -47, 54, 34);
        g.endFill();
        g.beginFill(0x0a1830);
        g.drawRect(-25, -45, 50, 30);
        g.endFill();
        g.beginFill(0x1a3050);
        g.drawRect(-25, -45, 16, 6);
        g.endFill();
        g.beginFill(0x0f2040);
        g.drawRect(-8, -45, 16, 6);
        g.endFill();
        g.beginFill(0x0a1a30);
        g.drawRect(-4, -10, 8, 12);
        g.endFill();
        g.drawRect(-10, 2, 20, 4);

        c.addChild(g);
        this._placeItem(c, gx, gy, 'second_monitor', true, 'browser');
    }

    _addWhiteboard(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x1a1a30);
        g.drawRect(-35, -65, 70, 58);
        g.endFill();
        g.beginFill(0xeeeef5);
        g.drawRect(-32, -62, 64, 52);
        g.endFill();
        g.lineStyle(2, 0x334466, 0.8);
        g.moveTo(-26, -50); g.lineTo(10, -50);
        g.moveTo(-26, -42); g.lineTo(20, -42);
        g.moveTo(-26, -34); g.lineTo(5, -34);
        g.lineStyle(2, 0xcc3333, 0.7);
        g.drawRect(-10, -30, 20, 16);
        g.lineStyle(0);
        g.beginFill(0x0a1020);
        g.drawRect(-32, -10, 64, 6);
        g.endFill();

        c.addChild(g);
        this._placeItem(c, gx, gy, 'whiteboard', true, 'notes');
    }

    _addPhone(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x111122);
        g.drawRoundedRect(-8, -18, 16, 28, 3);
        g.endFill();
        g.beginFill(0x1a2a4a);
        g.drawRoundedRect(-6, -16, 12, 22, 2);
        g.endFill();
        g.beginFill(0xff5050);
        g.drawCircle(4, -14, 3);
        g.endFill();
        g.lineStyle(1, 0x334466);
        g.drawCircle(0, 10, 3);

        c.addChild(g);

        const notifDot = new PIXI.Graphics();
        notifDot.beginFill(0xff3333);
        notifDot.drawCircle(0, 0, 4);
        notifDot.endFill();
        notifDot.x = 7;
        notifDot.y = -18;
        notifDot.visible = false;
        c.addChild(notifDot);
        this._phoneNotifDot = notifDot;

        this._placeItem(c, gx, gy, 'phone', true, 'chat');
    }

    _addCoffeeMachine(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x1a1a2a);
        g.drawRoundedRect(-16, -40, 32, 52, 4);
        g.endFill();
        g.beginFill(0x111118);
        g.drawRoundedRect(-13, -38, 26, 20, 3);
        g.endFill();
        g.beginFill(0x0a1a30, 0.9);
        g.drawRoundedRect(-10, -52, 20, 16, 3);
        g.endFill();
        g.beginFill(0xffffff);
        g.drawRect(-7, 8, 14, 14);
        g.endFill();
        g.beginFill(0x3a1a00);
        g.drawRect(-5, 10, 10, 10);
        g.endFill();
        g.beginFill(0x00cc44);
        g.drawCircle(0, -10, 4);
        g.endFill();

        c.addChild(g);

        const coffeeGlow = new PIXI.Graphics();
        coffeeGlow.beginFill(0x44cc66, 0.06);
        coffeeGlow.drawEllipse(0, 22, 40, 14);
        coffeeGlow.endFill();
        c.addChildAt(coffeeGlow, 0);

        this._coffeeContainer = c;
        this._placeItem(c, gx, gy, 'coffee_machine', true, null);
    }

    _addPlant(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x6b3010);
        g.moveTo(-10, 10); g.lineTo(10, 10); g.lineTo(12, 26); g.lineTo(-12, 26); g.closePath();
        g.endFill();
        g.beginFill(0x8b4513);
        g.drawRect(-11, 8, 22, 5);
        g.endFill();
        g.beginFill(0x2a1a0a);
        g.drawEllipse(0, 10, 10, 4);
        g.endFill();

        c.addChild(g);
        this._placeItem(c, gx, gy, 'plant', false, null);
    }

    onInterventionAccepted() {
        this.acceptedInterventions++;
    }

    _addSpeaker(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x111118);
        g.drawRoundedRect(-10, -24, 20, 36, 3);
        g.endFill();
        g.beginFill(0x2a2a3a);
        g.drawCircle(0, -8, 8);
        g.endFill();
        g.beginFill(0x111118);
        g.drawCircle(0, -8, 4);
        g.endFill();
        g.beginFill(0x0066ff);
        g.drawCircle(0, 8, 2);
        g.endFill();

        c.addChild(g);
        this._placeItem(c, gx, gy, 'speaker', true, null);
    }

    _addChair(gx, gy) {
        const c = new PIXI.Container();
        const g = new PIXI.Graphics();

        g.beginFill(0x1a1a30);
        g.drawRect(-16, -6, 32, 20);
        g.endFill();
        g.beginFill(0x222238);
        g.drawRect(-14, -28, 28, 24);
        g.endFill();
        g.lineStyle(1, 0x3a3a5a, 0.8);
        g.moveTo(-12, -16); g.lineTo(12, -16);
        g.lineStyle(0);
        g.beginFill(0x0a0a18);
        g.drawRect(-14, 14, 6, 16);
        g.drawRect(8, 14, 6, 16);
        g.endFill();
        g.beginFill(0x333345);
        g.drawCircle(-11, 30, 4);
        g.drawCircle(11, 30, 4);
        g.endFill();

        c.addChild(g);
        this._placeItem(c, gx, gy, 'chair', false, null);
    }

    _placeItem(container, gx, gy, name, interactive, appType) {
        const { x, y } = this.room.getTileCenter(gx, gy);
        container.x = x;
        container.y = y;

        if (interactive) {
            container.interactive = true;
            container.cursor = 'pointer';
            container.on('pointerdown', () => this.emit('interact', name));
        }

        this.container.addChild(container);
        this._items.push({ name, container, gridX: gx, gridY: gy, interactive, appType });
    }

    isBlocked(gx, gy) {
        return this._items.some(item => {
            if (item.name === 'chair' || item.name === 'phone') return false;
            return Math.abs(item.gridX - gx) < 0.65 && Math.abs(item.gridY - gy) < 0.65;
        });
    }

    attachToWorld(worldContainer) {
        this._items.forEach(item => {
            item.container.parent?.removeChild(item.container);
            worldContainer.addChild(item.container);
        });
    }

    _spawnSteam() {
        if (!this._coffeeContainer) return;
        const g = new PIXI.Graphics();
        const r = 1.5 + Math.random() * 2;
        g.beginFill(0xb0b8cc, 0.3);
        g.drawCircle(0, 0, r);
        g.endFill();
        const p = {
            gfx: g,
            x: (Math.random() - 0.5) * 6,
            y: 5,
            vy: -(0.25 + Math.random() * 0.25),
            vx: (Math.random() - 0.5) * 0.12,
            alpha: 0.4,
        };
        g.x = p.x; g.y = p.y;
        this._coffeeContainer.addChild(g);
        this._steamParticles.push(p);
    }

    update(delta) {
        this._animTick += delta;

        if (this._deskScanLine) {
            this._deskScanLine.y += 0.5 * delta;
            if (this._deskScanLine.y > -20) this._deskScanLine.y = -43;
        }

        if (this._termCursor) {
            this._termCursor.visible = Math.floor(this._animTick / 30) % 2 === 0;
        }

        this._coffeeSpawnAccum += delta;
        if (this._coffeeSpawnAccum > 18 + Math.random() * 10) {
            this._spawnSteam();
            this._coffeeSpawnAccum = 0;
        }

        if (this._phoneNotifDot?.visible) {
            this._phoneNotifDot.alpha = 0.6 + Math.sin(this._animTick / 8) * 0.4;
        }

        for (let i = this._steamParticles.length - 1; i >= 0; i--) {
            const p = this._steamParticles[i];
            p.x   += p.vx * delta;
            p.y   += p.vy * delta;
            p.alpha -= 0.005 * delta;
            p.gfx.x = p.x;
            p.gfx.y = p.y;
            p.gfx.alpha = p.alpha;
            if (p.alpha <= 0) {
                p.gfx.parent?.removeChild(p.gfx);
                p.gfx.destroy();
                this._steamParticles.splice(i, 1);
            }
        }
    }

    updateHighlights(playerGX, playerGY) {
        const INTERACT_RADIUS = 2;
        const pulse = 0.35 + Math.sin(Date.now() / 280) * 0.35;

        this._items.forEach(item => {
            if (!item.interactive) return;
            const dist = Math.abs(item.gridX - playerGX) + Math.abs(item.gridY - playerGY);
            const on = dist <= INTERACT_RADIUS;
            this._applyHighlight(item.container, on, pulse);
        });
    }

    _applyHighlight(container, on, pulse = 1) {
        container.tint = on ? HIGHLIGHT_COLOR : 0xffffff;

        if (on && !container._hlRing) {
            const ring = new PIXI.Graphics();
            container._hlRing = ring;
            container.addChildAt(ring, 0);
        }
        if (!container._hlRing) return;

        container._hlRing.visible = on;
        if (on) {
            container._hlRing.clear();
            container._hlRing.lineStyle(2, HIGHLIGHT_COLOR, pulse);
            container._hlRing.drawEllipse(0, 15, 28, 10);
        }
    }

    _drawMonitorContent(g, state) {
        g.clear();
        const S = {
            DEEP_FOCUS: { bg: 0x000820, line: 0x4488ff, alpha: 0.55, rows: 6 },
            STRESSED:   { bg: 0x1a0000, line: 0xff4444, alpha: 0.5,  rows: 4 },
            FATIGUED:   { bg: 0x0a0800, line: 0x886622, alpha: 0.3,  rows: 3 },
            RELAXED:    { bg: 0x001a0d, line: 0x00ff41, alpha: 0.4,  rows: 5 },
            WIRED:      { bg: 0x00061a, line: 0x00ccff, alpha: 0.6,  rows: 7 },
        };
        const cfg = S[state] || S.RELAXED;
        g.beginFill(cfg.bg);
        g.drawRect(-16, -43, 32, 23);
        g.endFill();
        const widths = [20, 12, 26, 8, 18, 24, 10, 14];
        g.lineStyle(1, cfg.line, cfg.alpha);
        for (let i = 0; i < cfg.rows; i++) {
            const y = -40 + i * 3;
            const w = widths[i % widths.length];
            g.moveTo(-14, y); g.lineTo(-14 + w, y);
        }
        if (state === 'STRESSED') {
            g.lineStyle(0);
            g.beginFill(0xff2222);
            g.drawCircle(10, -38, 2);
            g.endFill();
        }
        if (state === 'WIRED') {
            g.lineStyle(1, cfg.line, 0.22);
            for (let i = 0; i < 4; i++) {
                g.moveTo(-14, -42 + i * 2); g.lineTo(6 + i * 2, -42 + i * 2);
            }
        }
    }

    setPhoneNotification(visible) {
        if (this._phoneNotifDot) this._phoneNotifDot.visible = visible;
    }

    setMonitorState(state) {
        if (this._deskScreenOverlay) this._drawMonitorContent(this._deskScreenOverlay, state);
    }

    getNearbyInteractable(playerGX, playerGY) {
        const INTERACT_RADIUS = 2;
        let nearest = null;
        let nearestDist = Infinity;
        this._items.forEach(item => {
            if (!item.interactive) return;
            const dist = Math.abs(item.gridX - playerGX) + Math.abs(item.gridY - playerGY);
            if (dist <= INTERACT_RADIUS && dist < nearestDist) {
                nearestDist = dist;
                nearest = item.name;
            }
        });
        return nearest;
    }
}
