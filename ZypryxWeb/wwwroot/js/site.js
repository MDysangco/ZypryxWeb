
function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
}

function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
}


function toggleNav() {
    var sideNav = document.getElementById("mySidenav");
    var width = parseInt(sideNav.style.width) || 0;
    if (width === 0) {
        openNav();
    } else {
        closeNav();
    }
}

function formatMoney(v) {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    return `$${v.toFixed(2)}`;
}

function colorFromSymbol(sym) {
    let hash = 0;
    for (let i = 0; i < sym.length; i++) hash = (hash * 31 + sym.charCodeAt(i)) >>> 0;
    return '#' + (hash & 0xffffff).toString(16).padStart(6, '0');
}

function isValidCandle(c) {
    return !!c &&
        Number.isFinite(c.o) && Number.isFinite(c.h) &&
        Number.isFinite(c.l) && Number.isFinite(c.c) &&
        c.o > 0 && c.h > 0 && c.l > 0 && c.c > 0 &&
        c.h >= c.l;
}

function buildUiCoins(model) {

    const Coins = model.Coins || model.coins || [];
    const Klines = model.Klines || model.klines || [];

    return Coins.map(c => {
        const coinKlines = Klines
            .filter(k => k.coinId === c.id)
            .sort((a, b) => b.klineOpenTime - a.klineOpenTime);

        const latest = coinKlines[0];
        const prev = coinKlines[1];

        const price = latest?.closePrice ?? 0;
        const prevPrice = prev?.closePrice ?? price;

        const chg = price && prevPrice
            ? ((price - prevPrice) / prevPrice * 100)
            : 0;

        const h24 = Math.max(...coinKlines.slice(0, 24).map(k => k.highPrice ?? 0));
        const l24 = Math.min(...coinKlines.slice(0, 24).map(k => k.lowPrice ?? 0));

        const vol24 = coinKlines
            .slice(0, 24)
            .reduce((sum, k) => sum + (k.volume ?? 0), 0);

        return {
            id: c.id,
            sym: c.ticker,
            name: c.name,
            price: Number(price),
            chg: Number(chg.toFixed(2)),
            mcap: 'N/A',
            vol: formatMoney(vol24 * price),
            h24,
            l24,
            supply: 'N/A',
            signal: '-',
            conf: 50,
            color: colorFromSymbol(c.ticker)
        };
    });
}


function buildTicker(coins) {
    const track = document.getElementById('tickerTrack');
    if (!track || !Array.isArray(coins)) return;

    const fmtPair = s => (s || '').replace(/USDT$/, '/USDT');
    const fmtPrice = p => p >= 1
        ? '$' + p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '$' + p.toFixed(4);

    const all = [...coins, ...coins];
    track.innerHTML = all.map(c => {
        const chg = Number(c.chg) || 0;
        const up = chg >= 0;
        return `
        <span class="ticker-item">
          <span class="coin">${fmtPair(c.sym)}</span>
          <span class="price">${fmtPrice(Number(c.price) || 0)}</span>
          <span class="${up ? 'up' : 'down'}">${up ? '+' : ''}${chg.toFixed(2)}%</span>
        </span>`;
    }).join('');
}

function initPanelResizers() {
    document.querySelectorAll('.panel-resizer').forEach(rz => {
        const target = document.getElementById(rz.dataset.target);
        if (!target) return;

        const side = rz.dataset.side === 'right' ? 'right' : 'left';
        const min = parseInt(rz.dataset.min, 10) || 200;
        const max = parseInt(rz.dataset.max, 10) || 520;

        let startX = 0, startW = 0;

        const onMove = e => {
            const dx = e.clientX - startX;
            const raw = side === 'left' ? startW + dx : startW - dx;
            target.style.width = Math.max(min, Math.min(max, raw)) + 'px';
        };

        const onUp = () => {
            rz.classList.remove('dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onUp);
        };

        rz.addEventListener('mousedown', e => {
            e.preventDefault();
            startX = e.clientX;
            startW = target.getBoundingClientRect().width;
            rz.classList.add('dragging');
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        });
    });
}


class ZypChart {
    constructor(o = {}) {
        this.mc = document.getElementById(o.main || 'klineCanvas');
        this.vc = document.getElementById(o.vol || 'volCanvas');
        this.tip = document.getElementById(o.tip || 'chartTip');
        this.mx = this.mc.getContext('2d');
        this.vx = this.vc.getContext('2d');

        // ── Data ──────────────────────────────────────────────────────
        this.raw = [];   
        this.disp = []; 

        // ── View state ─────────────────────────────────────────────────
        this.tf = '4h';
        this.cw = 10;   // Candle slot width in pixels
        this.ve = -1;   // viewEnd (exclusive idx in disp[]). -1 = snap to latest
        this.hi = -1;   // Hover index in disp[]. -1 = none
        this.ct = 'candle'; // 'candle' | 'line'


        // ── Drag state ─────────────────────────────────────────────────
        this.drag = null; // { x, ve0 } while dragging

        // ── RAF dirty flag ─────────────────────────────────────────────
        this._dirty = true;

        this._bindEvents();
        this._startRAF();
        new ResizeObserver(() => this._mark()).observe(this.mc.parentElement);
    }

    load(candles1h) {
        this.raw = (candles1h || []).filter(isValidCandle);
        this._aggregate();
        this.ve = -1;          // Snap to latest on new data load
        this._setDefaultZoom();
        this._mark();
    }

    setTf(tf, btn) {
        if (btn) {
            document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        if (tf === this.tf) return;
        this.tf = tf;
        this._aggregate();
        this.ve = -1;
        this._setDefaultZoom();
        document.getElementById('cfInfo').textContent =
            `${tf.toUpperCase()} · ${this.disp.length.toLocaleString()} candles · ZYP-1 Oracle · scroll to zoom · drag to pan`;
        this._mark();
    }

    setType(type, btn) {
        if (btn) {
            document.querySelectorAll('.ct-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        }
        this.ct = type;
        this._mark();
    }

    jumpToLive() {
        this.ve = -1;
        this._mark();
        document.getElementById('liveBtn')?.classList.remove('show');
    }

    _aggregate() {
        const sz = { '1h': 1, '4h': 4, '1d': 24, '1w': 168 }[this.tf] || 1;
        if (sz === 1) { this.disp = this.raw; return; }

        this.disp = [];
        for (let i = 0; i < this.raw.length; i += sz) {
            const g = this.raw.slice(i, Math.min(this.raw.length, i + sz));
            if (!g.length) continue;

            // Propagate the most important signal from the group
            const sig = g.find(c => c.signal === 'BUY')?.signal
                || g.find(c => c.signal === 'SELL')?.signal
                || g.find(c => c.signal === 'HOLD')?.signal
                || null;

            this.disp.push({
                t: g[0].t,
                o: g[0].o,
                h: Math.max(...g.map(c => c.h)),
                l: Math.min(...g.map(c => c.l)),
                c: g[g.length - 1].c,
                v: g.reduce((s, c) => s + c.v, 0),
                signal: sig
            });
        }
    }

    _setDefaultZoom() {
        // Default visible candle count per TF
        const tgt = { '1h': 120, '4h': 100, '1d': 60, '1w': 30 }[this.tf] || 100;
        const chartW = this._cw();
        this.cw = Math.max(3, Math.min(30, chartW / tgt));
    }

    // Inner chart width (excludes price/time padding)
    _cw() { return Math.max(100, this.mc.clientWidth - 72 - 72); }
    _ch() { return Math.max(50, this.mc.clientHeight - 20 - 28); }

    // Resolved viewEnd (exclusive index, 0 means nothing visible)
    _rve() {
        const N = this.disp.length;
        return this.ve < 0 ? N : Math.min(N, this.ve);
    }

    // Resolved viewStart
    _rvs() {
        const vc = Math.ceil(this._cw() / this.cw) + 2; // +2 for partial candles at edges
        return Math.max(0, this._rve() - vc);
    }

    _bindEvents() {
        const mc = this.mc;

        // ── WHEEL: zoom, anchored to mouse position ──────────────────
        mc.addEventListener('wheel', e => {
            e.preventDefault();
            const r = mc.getBoundingClientRect();
            const rawMx = (e.clientX - r.left) * (mc.width / r.width);
            const mx = rawMx - 72; // relative to chart inner area (after left padding)
            if (mx < 0 || mx > this._cw()) return;

            const N = this.disp.length;
            const vs = this._rvs();

            // Candle index currently under the mouse — this is the zoom anchor
            const ci = vs + Math.floor(mx / this.cw);

            // New candle width after zoom
            const f = e.deltaY < 0 ? 1.13 : 0.885;
            const newCw = Math.max(2, Math.min(80, this.cw * f));

            // After zoom: ci should remain at the same pixel (mx)
            // (ci - newVs + 0.5) * newCw = mx  →  newVs = ci - (mx - 0.5*newCw) / newCw
            const newVis = Math.ceil(this._cw() / newCw) + 2;
            const newVs = Math.round(ci - mx / newCw);
            const newVe = newVs + newVis;

            this.cw = newCw;
            this.ve = Math.max(newVis, Math.min(N, newVe));

            this._updateLiveBtn();
            this._mark();
        }, { passive: false });

        // ── MOUSEDOWN: start drag ────────────────────────────────────
        mc.addEventListener('mousedown', e => {
            if (e.button !== 0) return;
            const r = mc.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (mc.width / r.width);
            this.drag = { x: mx, ve0: this._rve() };
            mc.style.cursor = 'grabbing';
            e.preventDefault();
        });


        // ── MOUSEMOVE: drag pan + crosshair ─────────────────────────
        window.addEventListener('mousemove', e => {
            const r = mc.getBoundingClientRect();
            const mx = (e.clientX - r.left) * (mc.width / r.width);
            const my = (e.clientY - r.top) * (mc.height / r.height);

            // ─ PAN ─
            if (this.drag) {
                const dx = mx - this.drag.x;
                // Positive dx (dragging right) = scrolling back in time = ve decreases
                const delta = -Math.round(dx / this.cw);
                const N = this.disp.length;
                const minVe = Math.ceil(this._cw() / this.cw);
                this.ve = Math.max(minVe, Math.min(N, this.drag.ve0 + delta));
                this._updateLiveBtn();
                this._mark();
                return;
            }

            // ─ CROSSHAIR ─
            const PL = 72, PR = 72, PT = 20, PB = 28;
            const inChart = mx > PL && mx < mc.width - PR
                && my > PT && my < mc.height - PB;

            if (inChart) {
                const vs = this._rvs();
                const raw_ci = vs + Math.floor((mx - PL) / this.cw);
                const ci = Math.max(0, Math.min(this.disp.length - 1, raw_ci));
                if (ci !== this.hi) {
                    this.hi = ci;
                    this._updateTip(e.clientX, e.clientY, r);
                    this._updOHLC(ci);
                    this._mark();
                }
            } else {
                this._clearHover();
            }
        });

        // ── MOUSEUP: end drag ────────────────────────────────────────
        window.addEventListener('mouseup', () => {
            if (this.drag) { this.drag = null; mc.style.cursor = 'crosshair'; }
        });

        mc.addEventListener('mouseleave', () => {
            if (!this.drag) this._clearHover();
        });
    }

    _clearHover() {
        if (this.hi !== -1) {
            this.hi = -1;
            if (this.tip) this.tip.style.display = 'none';
            this._updOHLC(-1);
            this._mark();
        }
    }

    _updateLiveBtn() {
        const atLive = this.ve < 0 || this.ve >= this.disp.length;
        document.getElementById('liveBtn')?.classList.toggle('show', !atLive);
    }

    _fv(p) {
        return p >= 10000 ? p.toLocaleString('en-US', { maximumFractionDigits: 0 })
            : p >= 100 ? p.toFixed(2)
                : p >= 1 ? p.toFixed(4)
                    : p.toFixed(6);
    }

    _fp(p) { return '$' + this._fv(p); }

    _updateTip(cx, cy, r) {
        const c = this.disp[this.hi];
        if (!c || !this.tip) return;
        const sc = c.signal === 'BUY' ? '#00c98d' : c.signal === 'SELL' ? '#ff4d4d' : '#ff8c00';
        const d = new Date(c.t);
        const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
        const dts = `${mo} ${d.getUTCDate()} ${d.getUTCHours().toString().padStart(2, '0')}:00 UTC`;
        const tx = Math.min(cx - r.left + 14, r.width - 165);
        const ty = Math.min(cy - r.top + 14, r.height - 160);
        this.tip.style.cssText = `display:block;left:${tx}px;top:${ty}px;`;
        this.tip.innerHTML = `
            <div class="tt-dt">${dts}</div>
            <div class="tt-r"><span class="tt-k">Open</span><span class="tt-v">${this._fv(c.o)}</span></div>
            <div class="tt-r"><span class="tt-k">High</span><span class="tt-v" style="color:#00c98d">${this._fv(c.h)}</span></div>
            <div class="tt-r"><span class="tt-k">Low</span><span class="tt-v" style="color:#ff4d4d">${this._fv(c.l)}</span></div>
            <div class="tt-r"><span class="tt-k">Close</span><span class="tt-v">${this._fv(c.c)}</span></div>
            <div class="tt-r"><span class="tt-k">Volume</span><span class="tt-v">${c.v.toFixed(2)}B</span></div>
            ${c.signal ? `<div class="tt-sig" style="color:${sc}">${c.signal}</div>` : ''}
          `;
    }


    _updOHLC(idx) {
        const c = idx >= 0 ? this.disp[idx] : this.disp[this.disp.length - 1];
        if (!c) return;
        const s = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
        s('oO', this._fv(c.o));
        s('oH', this._fv(c.h));
        s('oL', this._fv(c.l));
        s('oC', this._fv(c.c));
        s('oV', c.v.toFixed(2) + 'B');
        const se = document.getElementById('oS');
        if (se) {
            const col = c.signal === 'BUY' ? '#00c98d' : c.signal === 'SELL' ? '#ff4d4d' : '#ff8c00';
            se.innerHTML = c.signal
                ? `<span style="color:${col};font-weight:700;letter-spacing:2px;font-size:9px;">${c.signal}</span>`
                : '';
        }
    }

    _mark() { this._dirty = true; }

    _startRAF() {
        const loop = () => {
            if (this._dirty) {
                this._draw();
                this._drawVol();
                this._dirty = false;
            }
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    /* ─────────────────────────────────────────────────────────────────
         PRIVATE — MAIN CHART DRAW
      ───────────────────────────────────────────────────────────────── */

    _draw() {
        const mc = this.mc, ctx = this.mx;
        const W = mc.width = mc.clientWidth;
        const H = mc.height = mc.clientHeight;
        if (!W || !H || !this.disp.length) return;

        ctx.clearRect(0, 0, W, H);

        const PL = 72, PR = 72, PT = 20, PB = 28;
        const CW = W - PL - PR, CH = H - PT - PB;
        const N = this.disp.length;
        const vs = this._rvs();
        const ve = this._rve();

        // Visible slice — the only candles we ever iterate
        const vis = this.disp.slice(vs, ve);
        if (!vis.length) return;

        // Price range from visible candles + 8% breathing room
        const maxP = Math.max(...vis.map(c => c.h));
        const minP = Math.min(...vis.map(c => c.l));
        const buf = (maxP - minP) * 0.08 || maxP * 0.02;
        const vMax = maxP + buf, vMin = minP - buf, vRng = vMax - vMin || 1;

        const toX = i => PL + (i + 0.5) * this.cw;          // i = local index (0 = vs)
        const toY = p => PT + CH * (1 - (p - vMin) / vRng);
        const bw = Math.max(1, this.cw * 0.68);

        // ── HORIZONTAL GRID + PRICE LABELS ──────────────────────────
        for (let g = 0; g <= 6; g++) {
            const y = PT + (CH / 6) * g;
            const p = vMax - (vRng / 6) * g;
            ctx.strokeStyle = 'rgba(255,140,0,0.04)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(PL, y); ctx.lineTo(W - PR, y); ctx.stroke();
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '9px Share Tech Mono,monospace';
            ctx.textAlign = 'right';
            const lbl = p >= 10000 ? p.toFixed(0)
                : p >= 100 ? p.toFixed(1)
                    : p >= 1 ? p.toFixed(2)
                        : p.toFixed(4);
            ctx.fillText(lbl, PL - 5, y + 3.5);
        }

        // ── TIME AXIS ───────────────────────────────────────────────
        // Aim for ~1 label per 80px, snapped to meaningful intervals
        const visLen = ve - vs;
        const tgtLbls = Math.max(2, Math.floor(CW / 80));
        const itv = Math.max(1, Math.round(visLen / tgtLbls));
        // Align first label to a round multiple
        const first = Math.ceil(vs / itv) * itv - vs;

        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.font = '8px Share Tech Mono,monospace';
        ctx.textAlign = 'center';
        for (let i = first; i < vis.length; i += itv) {
            const x = toX(i);
            const ts = vis[i]?.t;
            if (ts == null) continue;
            ctx.fillText(this._tlbl(ts), x, H - 6);
            ctx.strokeStyle = 'rgba(255,255,255,0.025)';
            ctx.lineWidth = 0.5;
            ctx.beginPath(); ctx.moveTo(x, PT); ctx.lineTo(x, H - PB); ctx.stroke();
        }

        // ── CHART BODY ───────────────────────────────────────────────
        if (this.ct === 'line') {
            // Line + gradient fill
            ctx.strokeStyle = '#ff8c00';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            vis.forEach((c, i) => i === 0 ? ctx.moveTo(toX(i), toY(c.c)) : ctx.lineTo(toX(i), toY(c.c)));
            ctx.stroke();
            if (vis.length > 1) {
                ctx.lineTo(toX(vis.length - 1), H - PB);
                ctx.lineTo(toX(0), H - PB);
                ctx.closePath();
                const grad = ctx.createLinearGradient(0, PT, 0, H - PB);
                grad.addColorStop(0, 'rgba(255,140,0,0.10)');
                grad.addColorStop(1, 'rgba(255,140,0,0)');
                ctx.fillStyle = grad;
                ctx.fill();
            }
        } else {
            // Candlesticks — only visible candles
            vis.forEach((c, i) => {
                const x = toX(i);
                const isUp = c.c >= c.o;
                const hov = vs + i === this.hi;
                const col = hov ? (isUp ? '#44ffb0' : '#ff7777')
                    : (isUp ? '#00c98d' : '#ff4d4d');
                const oY = toY(c.o), cY = toY(c.c), hY = toY(c.h), lY = toY(c.l);
                // Wick
                ctx.strokeStyle = col; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(x, hY); ctx.lineTo(x, lY); ctx.stroke();
                // Body
                ctx.fillStyle = col;
                ctx.fillRect(x - bw / 2, Math.min(oY, cY), bw, Math.max(1, Math.abs(oY - cY)));
            });
        }

        // ── SIGNAL MARKERS ───────────────────────────────────────────
        // Only render when zoomed in enough to see them clearly
        if (this.cw >= 4) {
            vis.forEach((c, i) => {
                if (!c.signal) return;
                const x = toX(i);
                ctx.textAlign = 'center';

                if (c.signal === 'BUY') {
                    const y = toY(c.l) + 16;
                    ctx.fillStyle = '#00c98d';
                    ctx.beginPath();
                    ctx.moveTo(x, y - 10); ctx.lineTo(x - 5, y + 1); ctx.lineTo(x + 5, y + 1);
                    ctx.closePath(); ctx.fill();
                    if (this.cw >= 8) {
                        ctx.font = 'bold 7px Share Tech Mono,monospace';
                        ctx.fillText('B', x, y + 11);
                    }
                } else if (c.signal === 'SELL') {
                    const y = toY(c.h) - 16;
                    ctx.fillStyle = '#ff4d4d';
                    ctx.beginPath();
                    ctx.moveTo(x, y + 10); ctx.lineTo(x - 5, y - 1); ctx.lineTo(x + 5, y - 1);
                    ctx.closePath(); ctx.fill();
                    if (this.cw >= 8) {
                        ctx.font = 'bold 7px Share Tech Mono,monospace';
                        ctx.fillText('S', x, y - 8);
                    }
                } else { // HOLD
                    const y = toY((c.h + c.l) / 2);
                    ctx.fillStyle = '#ff8c00';
                    ctx.beginPath();
                    ctx.arc(x, y, Math.max(0.5, Math.min(4, this.cw * 0.35)), 0, Math.PI * 2);
                    ctx.fill();
                    if (this.cw >= 8) {
                        ctx.font = 'bold 7px Share Tech Mono,monospace';
                        ctx.fillStyle = 'rgba(255,140,0,0.85)';
                        ctx.fillText('H', x, y - 6);
                    }
                }
            });
        }

        // ── CURRENT PRICE DASHED LINE (only at live edge) ───────────
        const last = this.disp[N - 1];
        if (last && ve >= N) {
            const ly = toY(last.c);
            ctx.strokeStyle = 'rgba(255,140,0,0.55)';
            ctx.lineWidth = 0.8;
            ctx.setLineDash([4, 4]);
            ctx.beginPath(); ctx.moveTo(PL, ly); ctx.lineTo(W - PR, ly); ctx.stroke();
            ctx.setLineDash([]);
            // Orange price tag on right axis
            ctx.fillStyle = '#ff8c00';
            ctx.fillRect(W - PR, ly - 9, PR + 1, 18);
            ctx.fillStyle = '#080808';
            ctx.font = 'bold 9px Share Tech Mono,monospace';
            ctx.textAlign = 'left';
            ctx.fillText(this._fv(last.c), W - PR + 3, ly + 3.5);
        }

        // ── CROSSHAIR ───────────────────────────────────────────────
        if (this.hi >= vs && this.hi < ve) {
            const ri = this.hi - vs;
            const hx = toX(ri);
            const hy = toY(this.disp[this.hi].c);
            ctx.strokeStyle = 'rgba(255,255,255,0.1)';
            ctx.lineWidth = 0.7;
            ctx.setLineDash([3, 3]);
            ctx.beginPath(); ctx.moveTo(hx, PT); ctx.lineTo(hx, H - PB); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(PL, hy); ctx.lineTo(W - PR, hy); ctx.stroke();
            ctx.setLineDash([]);
            // Price label on right axis for hover position
            const hp = this.disp[this.hi].c;
            const hpl = this._fv(hp);
            ctx.fillStyle = 'rgba(40,40,40,0.9)';
            ctx.fillRect(W - PR, hy - 8, PR, 16);
            ctx.fillStyle = 'rgba(255,255,255,0.8)';
            ctx.font = '8px Share Tech Mono,monospace';
            ctx.textAlign = 'left';
            ctx.fillText(hpl, W - PR + 3, hy + 3.5);
        }

        // ── MINI SCROLLBAR ───────────────────────────────────────────
        // Shows position in full history (like Binance's bottom scrollbar)
        const sbH = 2;
        const sbY = H - PB + 16;
        const sbW = CW * 0.85;
        const sbX = PL + (CW - sbW) / 2;
        const visN = ve - vs;
        const tmbW = Math.max(16, sbW * visN / N);
        const maxSc = Math.max(1, N - visN);
        const frac = vs / maxSc;              // 0 = oldest, 1 = newest
        const tmbX = sbX + frac * (sbW - tmbW);

        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(sbX, sbY, sbW, sbH);
        ctx.fillStyle = 'rgba(255,140,0,0.35)';
        ctx.fillRect(tmbX, sbY, tmbW, sbH);
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — VOLUME CHART
    ───────────────────────────────────────────────────────────────── */

    _drawVol() {
        const vc = this.vc, vx = this.vx;
        const W = vc.width = vc.clientWidth;
        const H = vc.height = vc.clientHeight;
        if (!W || !H || !this.disp.length) return;
        vx.clearRect(0, 0, W, H);

        const PL = 72, PR = 72;
        const vs = this._rvs(), ve = this._rve();
        const vis = this.disp.slice(vs, ve);
        if (!vis.length) return;

        const maxV = Math.max(...vis.map(c => c.v)) || 1;
        const bw = Math.max(1, this.cw * 0.68);

        vis.forEach((c, i) => {
            const x = PL + (i + 0.5) * this.cw;
            const bh = (c.v / maxV) * (H - 8);
            const hov = vs + i === this.hi;
            vx.fillStyle = hov
                ? (c.c >= c.o ? 'rgba(0,201,141,0.75)' : 'rgba(255,77,77,0.75)')
                : (c.c >= c.o ? 'rgba(0,201,141,0.30)' : 'rgba(255,77,77,0.30)');
            vx.fillRect(x - bw / 2, H - bh, bw, bh);
        });

        vx.fillStyle = 'rgba(255,140,0,0.2)';
        vx.font = '7px Share Tech Mono,monospace';
        vx.textAlign = 'left';
        vx.fillText('VOL', PL + 4, 10);
    }

    /* ─────────────────────────────────────────────────────────────────
       PRIVATE — TIME LABEL FORMATTER
    ───────────────────────────────────────────────────────────────── */

    _tlbl(ts) {
        const d = new Date(ts);
        const hh = d.getUTCHours().toString().padStart(2, '0');
        const mo = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
            'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
        const dd = d.getUTCDate();
        if (this.tf === '1h' || this.tf === '4h') {
            return hh === '00' ? `${mo} ${dd}` : `${hh}:00`;
        }
        return `${mo} ${dd}`;
    }

}


