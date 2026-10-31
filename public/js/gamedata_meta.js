(function (root, factory) {
    if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.GAME_META = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    return {
        // Внутренние пути (Inner Ways) - редкость
        innerWays: {
            echoes_of_oblivion: { rarity: 'Legendary', desc: 'Светлые атаки накладывают Sin, атаки в Flameslash — Karma. При обоих эффектах игнорируется 10% физ. защиты.' },
            sword_morph: { rarity: 'Legendary', desc: 'Заряженная атака Nameless Sword выпускает энергетические волны при наличии Qi Shield.' },
            royal_remedy: { rarity: 'Legendary', desc: 'Увеличивает лечение клона от Cloudburst Healing на 10%. Дает каплю росы при лечении.' },
            exquisite_scenery: { rarity: 'Legendary', desc: 'Защита Thundercry Blade позволяет использовать Charged Heavy Attack без заряда. Восстанавливает 1 сегмент Battle Will.' },
            morale_chant: { rarity: 'Legendary', desc: 'Атака или лечение могут повысить урон или получаемое лечение. Складывается до 5 раз.' },
            seasonal_edge: { rarity: 'Legendary', desc: 'После навыка Dual Weapon временно повышается один из статов (крит, уязвимость, физ. урон и т.д.).' },
            sword_horizon: { rarity: 'Legendary', desc: 'После Martial Art, Special или Charged Skill с Strategic Sword можно применить Crosswind Blade с высоким Bleed уроном.' },
            blossom_barrage: { rarity: 'Legendary', desc: 'Spring Sorrow (Vernal Umbrella) получает 2 заряда, а попадания увеличивают урон от Projectile навыков.' },
            
            adaptive_steel: { rarity: 'Rare', desc: 'Каждое оружие (кроме Rope Dart) дает уникальный эффект: Bleed, игнорирование защиты, усиление после Perfect Dodge и т.д.' },
            trapped_beast: { rarity: 'Rare', desc: 'При получении урона ниже 30% HP создает щит, поглощающий до 30% макс. HP.' },
            invigorated_warrior: { rarity: 'Rare', desc: 'Увеличивает весь урон и лечение на 5%, но при получении удара эффект отключается на 5 сек.' },
            vital_leech: { rarity: 'Rare', desc: 'Exhaustion Execution восстанавливает HP в размере 8% нанесенного урона.' },
            fury_harvest: { rarity: 'Rare', desc: 'Некоторые действия восстановления с 50% шансом генерируют 1 Vitality.' },
            evasive_charge: { rarity: 'Rare', desc: 'После Perfect Dodge с 50% шансом восстанавливает выносливость, потраченную на уклонение.' },
            mountains_might: { rarity: 'Rare', desc: 'Mountain Sweep (Nameless Spear) снижает затраты выносливости на 20% на 5 сек.' },
            thunderous_bloom: { rarity: 'Rare', desc: 'Перемещение >15 м за 3 сек дает бафф Spring Thunder, усиливающий следующие 3 Heavy Attacks на 15%.' },
            restoring_blossom: { rarity: 'Rare', desc: 'Критическое лечение накладывает стак Nurturing (до 3), увеличивая получаемое лечение на 2% за стак.' },
            riptide_reflex: { rarity: 'Rare', desc: 'Попадание Control навыком снижает кулдаун текущего Martial Art навыка на 1 сек.' },
            bitter_seasons: { rarity: 'Rare', desc: 'Каждое попадание может наложить Poison, наносящий урон со временем и снижающий физ. защиту.' },
            divine_roulette: { rarity: 'Rare', desc: 'После Deflection получает случайный бафф (урон, гарантированный крит или уязвимость). Раз в 30 сек.' },
            wildfire_spark: { rarity: 'Rare', desc: 'Возвращает часть выносливости при каждом использовании навыка.' },
            battle_anthem: { rarity: 'Rare', desc: 'Charged Skills наносят больше урона боссам.' },
            insightful_strike: { rarity: 'Rare', desc: 'Precision Critical Damage усиливает способность контратаковать, повышает Precision Crit и может снизить получаемый урон.' },
            flying_gourds: { rarity: 'Rare', desc: 'Peak\'s Springless Silence (Inkwell Fan) получает 2 заряда, но с увеличенным кулдауном.' },
            star_reacher: { rarity: 'Rare', desc: 'Подбрасывание врага в воздух дает бонус к Physical Attack.' },
            esoteric_revival: { rarity: 'Rare', desc: 'Golden Dawn Revival (Panacea Fan) восстанавливает больше HP возрожденной цели.' },
            mending_loom: { rarity: 'Rare', desc: 'Echoing Grow (Soulshade Umbrella) восстанавливает Dew при использовании, а трата Dew дает больше лечения.' },
            art_of_resistance: { rarity: 'Rare', desc: 'Щиты HP и эффекты навыков, создающих их, длятся дольше.' },
            rock_solid: { rarity: 'Rare', desc: 'Storm Roar (Stormbreaker Spear) дает больше снижения урона во время Taunt, но уменьшает ваш урон и повышает аггро.' },
            vendetta: { rarity: 'Rare', desc: 'Vendetta Token (Bladebound Thread) длится дольше и восстанавливает Tokens of Gratitude.' },
            breaking_point: { rarity: 'Rare', desc: 'Крит по истощенным врагам (пустая шкала Qi) дает стак Disintegration (до 3). Дает физ. проникновение и бонус крит. урона.' },
            fivefold_bleed: { rarity: 'Rare', desc: 'Каждое попадание может наложить Bleed, который при макс. стаках взрывается, нанося Piercing урон.' },

            wind_beneath_wings: { rarity: 'Common', desc: 'Снижает затраты выносливости на рывок в прыжке на 10%, давая 30% скорости на 3 сек после приземления. Восстанавливает HP при убийстве.' },
            evening_snow: { rarity: 'Common', desc: 'Дает Snow Vision на 4 сек после входа в бой, если HP упало ниже 60% за первые 12 сек. Восстанавливает 2% макс. HP + 600 HP в секунду.' },
            steadfast_stance: { rarity: 'Common', desc: 'Снижает шанс быть оглушенным атаками обычных врагов.' },
            shadow_assault: { rarity: 'Common', desc: 'Увеличивает дальность Touch of Death на 1.5 м и урон на 10%. Восстанавливает 5% HP от нанесенного урона.' },
            // Остальные внутренние пути (если нет точных данных, ставим Rare по умолчанию)
            light_anew: { rarity: 'Rare', desc: 'Внутренний путь, восстанавливающий силы.' },
            song_of_tang: { rarity: 'Rare', desc: 'Песнь Тан, усиливающая определенные аспекты боя.' },
            towline_sweep: { rarity: 'Rare', desc: 'Затягивающий удар, полезный для контроля.' },
            phantom_rally: { rarity: 'Rare', desc: 'Призрачный сбор, усиливающий группу.' },
            wildfire_surge: { rarity: 'Rare', desc: 'Всплеск дикого огня, наносящий урон по площади.' }
        },
        // Мистические навыки (Mystic Skills) - используем категорию как редкость/цвет
        mysticSkills: {
            tai_chi: { rarity: 'Offensive', desc: 'Базовая техника, наносящая урон и оглушающая.' },
            meridian_touch: { rarity: 'Offensive', desc: 'Точечный удар, наносящий высокий урон.' },
            celestial_seize: { rarity: 'Offensive', desc: 'Притягивает врагов или предметы.' },
            cloud_steps: { rarity: 'Offensive', desc: 'Прыжок с ударом сверху.' },
            leaping_toad: { rarity: 'Offensive', desc: 'Прыжок жабы, наносящий урон по области.' },
            lions_roar: { rarity: 'Offensive', desc: 'Мощный рык, оглушающий врагов.' },
            guardian_palm: { rarity: 'Offensive', desc: 'Удар ладонью, отбрасывающий врагов.' },
            ghost_bind: { rarity: 'Offensive', desc: 'Связывает призрачными путами.' },
            flaming_meteor: { rarity: 'Offensive', desc: 'Призывает пылающий метеор.' },
            wolflike_frenzy: { rarity: 'Offensive', desc: 'Волчье бешенство, серия быстрых атак.' },
            talon_strike: { rarity: 'Offensive', desc: 'Удар когтя, наносящий кровотечение.' },
            yaksha_rush: { rarity: 'Offensive', desc: 'Натиск якши, мощный рывок.' },
            free_morph: { rarity: 'Offensive', desc: 'Свободная трансформация, меняющая стойку.' },
            soaring_spin: { rarity: 'Offensive', desc: 'Взлетающее вращение, урон по площади.' },
            dragons_breath: { rarity: 'Offensive', desc: 'Дыхание дракона, мощный огненный урон.' },
            drunken_poet: { rarity: 'Offensive', desc: 'Пьяный поэт, непредсказуемые атаки.' },
            blinding_mist: { rarity: 'Offensive', desc: 'Слепящий туман, дезориентирует врагов.' },
            dragon_head: { rarity: 'Offensive', desc: 'Голова дракона, сокрушительный удар.' },
            serene_breeze: { rarity: 'Offensive', desc: 'Безмятежный бриз, успокаивающий и наносящий урон.' },
            ghostly_steps: { rarity: 'Offensive', desc: 'Призрачные шаги, уклонение с уроном.' },
            honking_havoc: { rarity: 'Offensive', desc: 'Гусиный хаос, хаотичные атаки.' },
            glow_of_fireflies: { rarity: 'Offensive', desc: 'Свечение светлячков, постепенный урон.' },
            veil_of_stillness: { rarity: 'Offensive', desc: 'Покров неподвижности, замедляет врагов.' },
            golden_body: { rarity: 'Offensive', desc: 'Золотое тело, повышает защиту.' },
            contortion: { rarity: 'Offensive', desc: 'Искривление, уклонение от атак.' },
            flute_of_tides: { rarity: 'Offensive', desc: 'Флейта приливов, волновой урон.' },
            goosy_slide: { rarity: 'Offensive', desc: 'Гусиное скольжение, быстрое перемещение.' },

            still_waters: { rarity: 'General', desc: 'Тихие воды, пассивное восстановление.' },
            touch_of_death: { rarity: 'General', desc: 'Касание смерти, добивание ослабленных врагов.' },
            wind_sense: { rarity: 'General', desc: 'Чувство ветра, обнаружение врагов.' },
            thousand_mile: { rarity: 'Movement', desc: 'Полет на тысячу ли, быстрое перемещение.' },
            meteor_flight: { rarity: 'Movement', desc: 'Полет метеора, стремительный рывок.' },
            fan_glider: { rarity: 'Movement', desc: 'Веер-планер, планирование в воздухе.' },
            wind_rider: { rarity: 'Movement', desc: 'Всадник ветра, ускорение.' },
            wallstride_swift: { rarity: 'Movement', desc: 'Бег по стенам: быстрый шаг.' },
            wallstride_shadow: { rarity: 'Movement', desc: 'Бег по стенам: теневой рывок.' },
            threefold_skywalk: { rarity: 'Movement', desc: 'Тройная небесная поступь.' },
            skywalk_dash: { rarity: 'Movement', desc: 'Небесный рывок.' },
            mighty_drop: { rarity: 'Movement', desc: 'Мощное падение, урон при приземлении.' },
            safe_mighty_drop: { rarity: 'Movement', desc: 'Безопасное падение без урона.' },
            abyss_dive: { rarity: 'Movement', desc: 'Прыжок в бездну, ныряние.' },
            moonleap_morph: { rarity: 'Movement', desc: 'Лунный прыжок, высокий прыжок.' }
        }
    };
}));
