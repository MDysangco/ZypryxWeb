
function openNav() {
    document.getElementById("mySidenav").style.width = "250px";
    document.getElementById("main").style.marginLeft = "250px";
    document.body.style.backgroundColor = "rgba(0,0,0,0.4)";
}

function closeNav() {
    document.getElementById("mySidenav").style.width = "0";
    document.getElementById("main").style.marginLeft= "0";
    document.body.style.backgroundColor = "white";
}


function toggleNav() {

    var sideNav = document.getElementById("mySidenav");
    if (sideNav.style.width <= 0) {
        openNav()
    } else {
        closeNav()
    }
}

function formatMoney(v) {
    if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
    if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
    if (v >= 1e6) return `$${(v / 1e6).toFixed(2)}M`;
    if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
    return `$${v.toFixed(2)}`;
}

function randomColor() {
    return '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');
}

function randomSignal() {
    const signals = ['BUY', 'SELL', 'HOLD'];
    return signals[Math.floor(Math.random() * signals.length)];
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
            vol: formatMoney(vol24),
            h24,
            l24,
            supply: 'N/A',
            signal: randomSignal(),
            conf: Math.floor(Math.random() * 41) + 60,
            color: randomColor()
        };
    });
}
