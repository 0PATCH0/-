<!DOCTYPE html>
<html lang="ru">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Where Winds Meet — Панель управления</title>
    <link rel="stylesheet" href="/css/style.css?v=25">
    <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;600;700&family=Marcellus&display=swap" rel="stylesheet">
    <style>
        * { box-sizing: border-box; }
        html, body { margin: 0; padding: 0; overflow-x: hidden; }
        body {
            font-family: 'Marcellus', serif;
            color: #e8e3d4;
            background: #06070a;
            min-height: 100vh;
            position: relative;
        }

        /* ─────── Атмосферный фон с туманом ─────── */
        .hero-bg {
            position: fixed;
            inset: 0;
            z-index: 0;
            background:
                radial-gradient(ellipse at 20% 15%, rgba(212, 175, 55, 0.12) 0%, transparent 45%),
                radial-gradient(ellipse at 80% 85%, rgba(46, 204, 113, 0.08) 0%, transparent 45%),
                linear-gradient(180deg, #06070a 0%, #0d1015 50%, #06070a 100%);
            pointer-events: none;
        }

        /* Параллакс-горы (CSS-only, без картинок) */
        .parallax-layer {
            position: fixed;
            bottom: 0; left: 0;
            width: 100%;
            height: 45vh;
            z-index: 0;
            pointer-events: none;
            will-change: transform;
            transition: transform 0.15s ease-out;
        }
        .mountains-back {
            background: linear-gradient(180deg, transparent 0%, rgba(30, 35, 45, 0.4) 40%, rgba(15, 18, 24, 0.8) 100%);
            clip-path: polygon(0 100%, 0 65%, 8% 45%, 18% 60%, 28% 35%, 40% 55%, 52% 25%, 64% 50%, 76% 30%, 88% 55%, 100% 40%, 100% 100%);
            opacity: 0.7;
        }
        .mountains-mid {
            background: linear-gradient(180deg, transparent 0%, rgba(20, 24, 32, 0.7) 50%, rgba(10, 12, 16, 0.95) 100%);
            clip-path: polygon(0 100%, 0 75%, 10% 55%, 22% 70%, 35% 45%, 48% 65%, 60% 40%, 72% 62%, 85% 48%, 100% 68%, 100% 100%);
            height: 35vh;
            opacity: 0.85;
        }

        /* Туман */
        .fog {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1;
            background:
                radial-gradient(ellipse at 50% 100%, rgba(212, 175, 55, 0.06) 0%, transparent 50%),
                radial-gradient(ellipse at 20% 80%, rgba(255, 255, 255, 0.02) 0%, transparent 40%);
            animation: fogPulse 12s ease-in-out infinite alternate;
        }
        @keyframes fogPulse {
            0% { opacity: 0.5; }
            100% { opacity: 1; }
        }

        /* Плавающие частицы (лепестки/пыль) */
        .particles {
            position: fixed;
            inset: 0;
            pointer-events: none;
            z-index: 1;
            overflow: hidden;
        }
        .particle {
            position: absolute;
            width: 3px;
            height: 3px;
            background: rgba(212, 175, 55, 0.6);
            border-radius: 50%;
            box-shadow: 0 0 6px rgba(212, 175, 55, 0.8);
            animation: floatParticle linear infinite;
        }
        @keyframes floatParticle {
            0% { transform: translateY(0) translateX(0); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateY(-100vh) translateX(50px); opacity: 0; }
        }

        /* ─────── Контент ─────── */
        .container {
            position: relative;
            z-index: 2;
            max-width: 1200px;
            margin: 0 auto;
            padding: 40px 20px 120px;
        }

        .header-nav {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 80px;
            animation: fadeDown 1s ease-out;
        }
        @keyframes fadeDown {
            from { opacity: 0; transform: translateY(-30px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .logo {
            font-family: 'Cinzel', serif;
            font-size: 22px;
            font-weight: 700;
            letter-spacing: 3px;
            color: var(--gold, #d4af37);
            text-shadow: 0 0 20px rgba(212, 175, 55, 0.5);
        }

        .nav-user {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .nav-user img {
            width: 40px; height: 40px;
            border-radius: 50%;
            border: 2px solid rgba(212, 175, 55, 0.5);
            box-shadow: 0 0 12px rgba(212, 175, 55, 0.3);
        }
        .nav-user span { color: #e8e3d4; font-size: 14px; }

        /* ─────── Hero ─────── */
        .hero {
            text-align: center;
            padding: 60px 0 100px;
            animation: fadeUp 1.2s ease-out 0.3s both;
        }
        @keyframes fadeUp {
            from { opacity: 0; transform: translateY(40px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .hero-title {
            font-family: 'Cinzel', serif;
            font-size: clamp(38px, 8vw, 72px);
            font-weight: 700;
            letter-spacing: 4px;
            background: linear-gradient(135deg, #d4af37 0%, #f4e4a0 40%, #aa8624 70%, #d4af37 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            margin: 0 0 20px;
            line-height: 1.1;
            filter: drop-shadow(0 0 30px rgba(212, 175, 55, 0.4));
        }

        .hero-subtitle {
            font-size: clamp(14px, 2.5vw, 18px);
            color: #8a8578;
            letter-spacing: 6px;
            text-transform: uppercase;
            margin-bottom: 60px;
            animation: fadeUp 1.2s ease-out 0.6s both;
        }
        .hero-subtitle::before,
        .hero-subtitle::after {
            content: '——';
            color: rgba(212, 175, 55, 0.5);
            margin: 0 15px;
        }

        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 12px;
            padding: 18px 40px;
            font-family: 'Cinzel', serif;
            font-size: 16px;
            font-weight: 600;
            letter-spacing: 2px;
            text-decoration: none;
            color: #0a0b10;
            background: linear-gradient(135deg, #d4af37, #aa8624);
            border: none;
            border-radius: 50px;
            cursor: pointer;
            position: relative;
            overflow: hidden;
            box-shadow: 0 10px 40px rgba(212, 175, 55, 0.3), 0 0 0 1px rgba(244, 228, 160, 0.5) inset;
            transition: all 0.3s ease;
            animation: fadeUp 1.2s ease-out 0.9s both;
        }
        .cta-button::before {
            content: '';
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, transparent 30%, rgba(255, 255, 255, 0.5) 50%, transparent 70%);
            transform: translateX(-100%);
            transition: transform 0.6s;
        }
        .cta-button:hover {
            transform: translateY(-3px);
            box-shadow: 0 15px 50px rgba(212, 175, 55, 0.5), 0 0 0 1px rgba(244, 228, 160, 0.7) inset;
        }
        .cta-button:hover::before {
            transform: translateX(100%);
        }

        /* ─────── Features ─────── */
        .features {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
            gap: 24px;
            margin-top: 60px;
        }

        .feature-card {
            background: linear-gradient(160deg, rgba(20, 24, 32, 0.85), rgba(12, 14, 20, 0.95));
            border: 1px solid rgba(212, 175, 55, 0.18);
            border-radius: 16px;
            padding: 32px 24px;
            position: relative;
            overflow: hidden;
            backdrop-filter: blur(10px);
            transition: all 0.4s ease;
            animation: fadeUp 1s ease-out both;
        }
        .feature-card:nth-child(1) { animation-delay: 1.1s; }
        .feature-card:nth-child(2) { animation-delay: 1.25s; }
        .feature-card:nth-child(3) { animation-delay: 1.4s; }
        .feature-card:nth-child(4) { animation-delay: 1.55s; }

        .feature-card::before {
            content: '';
            position: absolute;
            top: 0; left: 0; right: 0;
            height: 2px;
            background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.6), transparent);
            opacity: 0;
            transition: opacity 0.4s;
        }
        .feature-card:hover {
            transform: translateY(-6px);
            border-color: rgba(212, 175, 55, 0.5);
            box-shadow: 0 15px 40px rgba(212, 175, 55, 0.15);
        }
        .feature-card:hover::before { opacity: 1; }

        .feature-icon {
            font-size: 42px;
            margin-bottom: 16px;
            display: block;
            filter: drop-shadow(0 0 15px rgba(212, 175, 55, 0.4));
        }
        .feature-title {
            font-family: 'Cinzel', serif;
            font-size: 18px;
            color: #d4af37;
            margin-bottom: 10px;
            letter-spacing: 1px;
        }
        .feature-desc {
            font-size: 14px;
            color: #8a8578;
            line-height: 1.6;
        }

        /* ─────── Footer ─────── */
        .footer {
            text-align: center;
            margin-top: 80px;
            padding-top: 40px;
            border-top: 1px solid rgba(212, 175, 55, 0.1);
            color: #4a4538;
            font-size: 12px;
            letter-spacing: 3px;
            text-transform: uppercase;
        }

        /* ─────── Loading state ─────── */
        #auth-area {
            display: inline-flex;
            align-items: center;
            gap: 10px;
        }

        @media (max-width: 600px) {
            .header-nav { margin-bottom: 40px; }
            .hero { padding: 30px 0 60px; }
            .feature-card { padding: 24px 20px; }
            .cta-button { padding: 16px 32px; font-size: 14px; }
        }
    </style>
</head>
<body>
    <div class="hero-bg"></div>
    <div class="parallax-layer mountains-back" id="mountains-back"></div>
    <div class="parallax-layer mountains-mid" id="mountains-mid"></div>
    <div class="fog"></div>
    <div class="particles" id="particles"></div>

    <div class="container">
        <nav class="header-nav">
            <div class="logo">WHERE WINDS MEET</div>
            <div id="auth-area">
                <span style="color:#8a8578; font-size:14px;">Загрузка...</span>
            </div>
        </nav>

        <section class="hero">
            <h1 class="hero-title">Где Встречаются Ветра</h1>
            <p class="hero-subtitle">Панель управления</p>
            <a href="/auth/discord" class="cta-button" id="cta-main">
                <span>⚔</span>
                <span>Войти через Discord</span>
            </a>
        </section>

        <section class="features">
            <div class="feature-card">
                <span class="feature-icon">🥋</span>
                <div class="feature-title">Профили персонажей</div>
                <div class="feature-desc">Создавай до 3 персонажей, настраивай PvE и PvP билды: мистические навыки, внутренние пути и боевые искусства.</div>
            </div>
            <div class="feature-card">
                <span class="feature-icon">📅</span>
                <div class="feature-title">События и Сборы</div>
                <div class="feature-desc">Планируй рейды, турниры и мировые события. Записывайся в один клик, следи за составом в реальном времени.</div>
            </div>
            <div class="feature-card">
                <span class="feature-icon">📖</span>
                <div class="feature-title">Гайды и Знания</div>
                <div class="feature-desc">Делитесь тактиками, билдами и секретами мира Уся. Все гайды доступны как в браузере, так и прямо в Discord.</div>
            </div>
            <div class="feature-card">
                <span class="feature-icon">🛡️</span>
                <div class="feature-title">Управление Гильдией</div>
                <div class="feature-desc">Модерация, роли по кнопкам, напоминания и состав гильдии — всё в одной панели. Прозрачно и удобно.</div>
            </div>
        </section>

        <div class="footer">
            Where Winds Meet • Fan Project • 2026
        </div>
    </div>

    <script>
        // ─── Параллакс ───
        const mBack = document.getElementById('mountains-back');
        const mMid = document.getElementById('mountains-mid');
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const y = window.scrollY;
                    mBack.style.transform = `translateY(${y * 0.15}px)`;
                    mMid.style.transform = `translateY(${y * 0.3}px)`;
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        // ─── Частицы ───
        const particlesWrap = document.getElementById('particles');
        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.bottom = (Math.random() * 30) + '%';
            p.style.animationDuration = (8 + Math.random() * 12) + 's';
            p.style.animationDelay = (Math.random() * 10) + 's';
            p.style.opacity = 0.3 + Math.random() * 0.5;
            particlesWrap.appendChild(p);
        }

        // ─── Проверяем авторизацию ───
        fetch('/api/user', { credentials: 'include' })
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                const authArea = document.getElementById('auth-area');
                const cta = document.getElementById('cta-main');
                if (data && data.user) {
                    const u = data.user;
                    const avatar = u.avatar ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
                    authArea.innerHTML = `
                        <img src="${avatar}" alt="">
                        <span>${u.username}</span>
                    `;
                    cta.href = '/dashboard';
                    cta.querySelector('span:last-child').textContent = 'Перейти в панель';
                } else {
                    authArea.innerHTML = '';
                }
            })
            .catch(() => {
                document.getElementById('auth-area').innerHTML = '';
            });
    </script>
</body>
</html>
