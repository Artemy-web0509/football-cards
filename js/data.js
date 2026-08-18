// ===================== ДАННЫЕ ИГРЫ =====================

const SPIN_COST = 500;
const START_COINS = 3000;

// Донат-валюта (Кристаллы 🔮). Выдаётся только администратором или из кейсов квестов.
const GEM_EMOJI = '🔮';

// Прямые топ-игроки за донат-валюту 🔮 (донат-магазин)
const DONAT_PLAYERS = [
  { name: 'Месси',           price: 900 },
  { name: 'Роналду',         price: 900 },
  { name: 'Мбаппе',          price: 700 },
  { name: 'Хааланд',         price: 700 },
  { name: 'Беллингем',       price: 600 },
  { name: 'Кейн',            price: 500 },
  { name: 'Донаррумма',      price: 450 },
  { name: 'Ван Дейк',        price: 400 },
  { name: 'Левандовски',     price: 400 },
  { name: 'Сон Хынмин',      price: 350 },
  { name: 'Гризманн',        price: 300 },
  { name: 'Вирц',            price: 250 },
];

const POS_LABEL = { GK: 'ВРТ', DF: 'ЗАЩ', MF: 'ПЗ', FW: 'НАП' };
const POS_ORDER = ['GK', 'DF', 'MF', 'FW'];

// 5 уровней редкости: шанс выпадения, диапазон рейтинга,
// множитель цены продажи и множитель дохода в секунду
const RARITIES = {
  bronze:  { name: 'Бронза',  emoji: '🥉', chance: 0.58, rating: [62, 71],  sellMult: 1,   incomeMult: 1 },
  silver:  { name: 'Серебро', emoji: '🥈', chance: 0.25, rating: [72, 79],  sellMult: 3,   incomeMult: 3 },
  gold:    { name: 'Золото',  emoji: '🥇', chance: 0.12, rating: [80, 86],  sellMult: 8,   incomeMult: 8 },
  diamond: { name: 'Алмаз',   emoji: '💎', chance: 0.04, rating: [87, 92],  sellMult: 25,  incomeMult: 25 },
  secret:  { name: 'Секрет',  emoji: '👑', chance: 0.01, rating: [93, 100], sellMult: 80,  incomeMult: 80 },
  bingi:   { name: 'Бинги',   emoji: '🌈', chance: 0.001, rating: [101, 110], sellMult: 6000, incomeMult: 1500, hidden: true },
};
const RARITY_KEYS = Object.keys(RARITIES);
const SPIN_RARITY_KEYS = RARITY_KEYS.filter(k => !RARITIES[k].hidden);

// Формации и их бонусы к атаке/защите/владению
const FORMATIONS = {
  '4-3-3':   { name: '4-3-3',   df: 4, mf: 3, fw: 3, att: 0.05, def: 0.00, poss: 0.00 },
  '4-4-2':   { name: '4-4-2',   df: 4, mf: 4, fw: 2, att: 0.02, def: 0.02, poss: 0.01 },
  '3-5-2':   { name: '3-5-2',   df: 3, mf: 5, fw: 2, att: 0.02, def: -0.02, poss: 0.03 },
  '5-3-2':   { name: '5-3-2',   df: 5, mf: 3, fw: 2, att: -0.02, def: 0.05, poss: 0.00 },
  '4-2-3-1': { name: '4-2-3-1', df: 4, mf: 5, fw: 1, att: 0.03, def: 0.00, poss: 0.02 },
};

// Улучшения (за МОНЕТЫ). Удача — на табло у спиннера,
// Владение и Доход — на табло у футбольных полей. Дорогие — реально надо вкладываться
const UPGRADES = [
  { id: 'luck',       name: 'Удача',   icon: '🍀', bonus: 0.001, bonusDesc: '+0.1% шанс золота, +0.05% алмаза, +0.02% секрета', cost: 2000, costStep: 3, maxLevel: 40 },
  { id: 'possession', name: 'Владение', icon: '⚽', bonus: 0.02, bonusDesc: '+2% владение в матчах', cost: 3000, costStep: 3, maxLevel: 40 },
  { id: 'income',     name: 'Доход',    icon: '💰', bonus: 0.10, bonusDesc: '+10% дохода игроков',  cost: 3000, costStep: 3, maxLevel: 50 },
];

// Баффы в магазине (за ФАНАТОВ), постоянные и накапливаются
const BUFFS = [
  { id: 'all_income',      name: 'Доход всех',      desc: '+25% дохода всех игроков',            incMult: 0.25, cost: 250,  costStep: 1.7, maxLevel: 20, icon: '📈' },
  { id: 'silver_income',   name: 'Доход серебра',   desc: '+50% дохода серебра',                 incMult: 0.50, cost: 400,  costStep: 1.7, maxLevel: 10, icon: '🥈' },
  { id: 'gold_income',     name: 'Доход золота',    desc: '+100% дохода золота',                 incMult: 1.00, cost: 900,  costStep: 1.7, maxLevel: 10, icon: '🥇' },
  { id: 'diamond_income',  name: 'Доход алмаза',    desc: '+150% дохода алмазов',                incMult: 1.50, cost: 2200, costStep: 1.7, maxLevel: 10, icon: '💎' },
  { id: 'secret_income',   name: 'Доход секрета',   desc: '+200% дохода секретов',               incMult: 2.00, cost: 5500, costStep: 1.7, maxLevel: 10, icon: '👑' },
  { id: 'gold_chance',     name: 'Шанс золота',     desc: '+1% шанс выпадения золота',           chanceBonus: { gold: 0.01 }, cost: 1500, costStep: 2.2, maxLevel: 5, icon: '🎯' },
  { id: 'diamond_chance',  name: 'Шанс алмаза',     desc: '+0.5% шанс выпадения алмаза',         chanceBonus: { diamond: 0.005 }, cost: 4000, costStep: 2.2, maxLevel: 5, icon: '🎯' },
  { id: 'secret_chance',   name: 'Шанс секрета',    desc: '+0.25% шанс выпадения секрета',       chanceBonus: { secret: 0.0025 }, cost: 9000, costStep: 2.2, maxLevel: 5, icon: '🎯' },
];

// Кубки в магазине (за ФАНАТОВ), постоянные множители дохода
const CUPS = [
  { id: 'novice',     name: 'Кубок новичка',     cost: 400,  incMult: 0.10 },
  { id: 'bronze_cup', name: 'Бронзовый кубок',   cost: 1200, incMult: 0.15 },
  { id: 'silver_cup', name: 'Серебряный кубок',  cost: 3200, incMult: 0.20 },
  { id: 'gold_cup',   name: 'Золотой кубок',     cost: 8000, incMult: 0.25 },
  { id: 'champ_cup',  name: 'Кубок чемпиона',    cost: 20000, incMult: 0.30 },
];

// Мутации карточек (каждый час случайная карточка получает случайную мутацию).
// Множитель умножает доход карточки. Админ может выдать любую мутацию с любым множителем.
const MUTATIONS = [
  { id: 'shiny',   name: 'Сияние',       icon: '✨', base: 1.5,  color: '#ffe66b' },
  { id: 'cursed',  name: 'Проклятие',    icon: '💀', base: 2.5,  color: '#c050ff' },
  { id: 'venom',   name: 'Ядовитая',     icon: '🐍', base: 3,    color: '#39c98a' },
  { id: 'rainbow', name: 'Радуга',       icon: '🌈', base: 6,    color: '#57c7ff' },
  { id: 'divine',  name: 'Божественная', icon: '👼', base: 12,   color: '#ff2f9e' },
];

// Временная удача для спиннера (панель 🍀): включается на N минут, улучшает шансы
const LUCK_BOOSTS = [
  { id: 'normal', name: 'Удача',        icon: '🍀', desc: '+2% золото, +1% алмаз, +0.5% секрет', gold: 0.02, diamond: 0.01, secret: 0.005, costPerMin: 150  },
  { id: 'big',    name: 'Большая удача', icon: '✨', desc: '+5% золото, +2.5% алмаз, +1% секрет',  gold: 0.05, diamond: 0.025, secret: 0.01,  costPerMin: 600  },
  { id: 'mega',   name: 'Мега удача',    icon: '⭐', desc: '+10% золото, +5% алмаз, +2% секрет',   gold: 0.10, diamond: 0.05,  secret: 0.02,  costPerMin: 2000 },
];

// Интервал мутаций: раз в час. Шанс срабатывания — 50% (иначе ждём следующий час)
const MUTATION_INTERVAL = 3600 * 1000;
const MUTATION_CHANCE = 0.5;

// Соперники (боты) на стадионе. Награда — ФАНАТЫ
const OPPONENTS = [
  { id: 'weak',    name: 'Аутсайдеры',  emoji: '🐌', avg: 66, fansWin: 60,  fansDraw: 25 },
  { id: 'medium',  name: 'Середняки',   emoji: '⚙️', avg: 73, fansWin: 160, fansDraw: 70 },
  { id: 'strong',  name: 'Гранды',      emoji: '💪', avg: 79, fansWin: 340, fansDraw: 150 },
  { id: 'legend',  name: 'Легенды',     emoji: '👑', avg: 86, fansWin: 750, fansDraw: 320 },
];

// Квесты: 4 полосы по 5 заданий. Выполняются строго по порядку.
// type: wins/spins/income/coins/fans/players/gold/diamond/secret/mutation/pvp/cups/upgrades/beats
// В конце каждой полосы (5-й квест) — приз ROW_PRIZES. После всех 4 полос — кейс с 🔮 (rollGemsCase).
const QUESTS = [
  { id: 'q1',  type: 'wins',   target: 3,   title: 'Первые победы',        desc: 'Выиграй 3 матча',                          coins: 2000, fans: 50 },
  { id: 'q2',  type: 'players', target: 15, title: 'Расширяем команду',    desc: 'Собери 15 игроков',                        coins: 1500, fans: 40 },
  { id: 'q3',  type: 'spins',  target: 5,   title: 'Крутится-вертится',    desc: 'Прокрути спиннер 5 раз',                   coins: 2500, fans: 60 },
  { id: 'q4',  type: 'fans',   target: 300, title: 'Народная любовь',      desc: 'Накопи 300 фанатов',                       coins: 1500, fans: 80 },
  { id: 'q5',  type: 'gold',   target: 3,   title: 'В поисках золота',     desc: 'Собери 3 игрока золото и выше',            coins: 3000, fans: 100 },
  { id: 'q6',  type: 'wins',   target: 10,  title: 'Десятый матч',         desc: 'Всего 10 побед в матчах',                  coins: 4000, fans: 120 },
  { id: 'q7',  type: 'income', target: 300, title: 'Финансовый поток',     desc: 'Доход 300 💰/сек',                         coins: 3000, fans: 90 },
  { id: 'q8',  type: 'players', target: 30, title: 'Большой клуб',         desc: 'Собери 30 игроков',                        coins: 3500, fans: 110 },
  { id: 'q9',  type: 'spins',  target: 20,  title: 'Спиннер-профи',        desc: 'Прокрути спиннер 20 раз',                  coins: 5000, fans: 150 },
  { id: 'q10', type: 'diamond', target: 2,  title: 'Бриллиантовая нить',   desc: 'Собери 2 игрока алмаз и выше',             coins: 6000, fans: 200 },
  { id: 'q11', type: 'coins',  target: 30000, title: 'Состояние',          desc: 'Накопи 30 000 монет разом',                coins: 5000, fans: 160 },
  { id: 'q12', type: 'cups',   target: 2,   title: 'Коллекционер кубков',  desc: 'Купи 2 кубка',                              coins: 2500, fans: 130 },
  { id: 'q13', type: 'mutation', target: 3, title: 'Мистик',               desc: 'Засвети 3 мутировавшие карточки',          coins: 4500, fans: 170 },
  { id: 'q14', type: 'beats',  target: 3,   title: 'Зверобой',             desc: 'Победи 3 разных соперников',               coins: 4000, fans: 140 },
  { id: 'q15', type: 'fans',   target: 2000, title: 'Легенда города',      desc: 'Накопи 2000 фанатов',                      coins: 7000, fans: 300 },
  { id: 'q16', type: 'wins',   target: 25,  title: 'Стойкий чемпион',      desc: 'Всего 25 побед в матчах',                  coins: 8000, fans: 250 },
  { id: 'q17', type: 'players', target: 60, title: 'Полный состав мира',   desc: 'Собери 60 игроков',                        coins: 9000, fans: 300 },
  { id: 'q18', type: 'upgrades', target: 30, title: 'Ферма модернизации',  desc: '30 суммарных уровней улучшений',            coins: 7000, fans: 240 },
  { id: 'q19', type: 'spins',  target: 60,  title: 'Маньяк рулетки',       desc: 'Прокрути спиннер 60 раз',                  coins: 12000, fans: 400 },
  { id: 'q20', type: 'secret', target: 1,   title: 'Королевская сокровищница', desc: 'Заполучи Секретную карточку 👑',       coins: 20000, fans: 600 },
];

// Призы за полосы (5-й квест в каждой полосе). НЕ донат-валюта.
const ROW_PRIZES = [
  { coins: 15000, fans: 600,  label: 'Сундук монет' },
  { coins: 40000, fans: 1500, label: 'Серебряный сундук' },
  { coins: 100000, fans: 3000, label: 'Золотой сундук' },
  { coins: 200000, fans: 8000, label: 'Бриллиантовый сундук' },
];

// Кейс после всех 4 полос: 🔮 выпадает случайно.
// Чаще всего мало (5-20), редко — вплоть до 1000.
function rollGemsCase() {
  const r = Math.random();
  if (r < 0.82) return 5 + Math.floor(Math.random() * 16);          // 82% — 5..20
  if (r < 0.95) return 21 + Math.floor(Math.random() * 80);         // 13% — 21..100
  if (r < 0.995) return 101 + Math.floor(Math.random() * 400);      // 4.5% — 101..500
  return 501 + Math.floor(Math.random() * 500);                     // 0.5% — 501..1000 ДЖЕКПОТ
}

// 8 полей со спиннерами + арена в центре + зона магазинов.
// Поля расставлены так, чтобы прямоугольники не пересекались друг с другом
const BASE_COLORS = ['#3f8efc', '#ff5d5d', '#39c98a', '#ff9f1c', '#a35bff', '#ff4fc3', '#17c0e0', '#c8d630'];
const BASES = [
  { name: 'Поле «Север»',  color: BASE_COLORS[0], x: 30,  z: 24 },
  { name: 'Поле «Восток»', color: BASE_COLORS[1], x: 75,  z: 24 },
  { name: 'Поле «Юг»',     color: BASE_COLORS[2], x: 120, z: 24 },
  { name: 'Поле «Запад»',  color: BASE_COLORS[3], x: 30,  z: 76 },
  { name: 'Поле «Олимп»',  color: BASE_COLORS[4], x: 120, z: 76 },
  { name: 'Поле «Комета»', color: BASE_COLORS[5], x: 30,  z: 120 },
  { name: 'Поле «Вулкан»', color: BASE_COLORS[6], x: 120, z: 120 },
  { name: 'Поле «Гроза»',  color: BASE_COLORS[7], x: 75,  z: 120 },
];
const ARENA = { name: '⚔ Мультиплеер-арена', x: 75, z: 75, size: 20 };
const MARKET = { name: 'Магазины', color: '#ffd23d', x: 75, z: 170 };

const WORLD_SIZE = 180;
const PLAYER_SPAWN = { x: 60, z: 80, yaw: 1.57, facing: 1.57 };

// УНИКАЛЬНЫЕ РЕАЛЬНЫЕ ФУТБОЛИСТЫ: каждый игрок существует в игре в одном экземпляре.
// Редкость определяется рейтингом (см. rarityForRating).
const REAL_PLAYERS = [
  // 🇧🇷 Бразилия
  { name: 'Алиссон', flag: '🇧🇷', pos: 'GK', rating: 88 }, { name: 'Эдерсон', flag: '🇧🇷', pos: 'GK', rating: 88 },
  { name: 'Маркиньос', flag: '🇧🇷', pos: 'DF', rating: 87 }, { name: 'Милитао', flag: '🇧🇷', pos: 'DF', rating: 85 },
  { name: 'Касемиро', flag: '🇧🇷', pos: 'MF', rating: 87 }, { name: 'Фабиньо', flag: '🇧🇷', pos: 'MF', rating: 84 },
  { name: 'Бруно Гимарайнс', flag: '🇧🇷', pos: 'MF', rating: 84 }, { name: 'Пакинета', flag: '🇧🇷', pos: 'MF', rating: 83 },
  { name: 'Винисиус', flag: '🇧🇷', pos: 'FW', rating: 94 }, { name: 'Неймар', flag: '🇧🇷', pos: 'FW', rating: 95 },
  { name: 'Рафинья', flag: '🇧🇷', pos: 'FW', rating: 85 }, { name: 'Родриго', flag: '🇧🇷', pos: 'FW', rating: 84 },
  { name: 'Ришарлисон', flag: '🇧🇷', pos: 'FW', rating: 82 }, { name: 'Мартинелли', flag: '🇧🇷', pos: 'FW', rating: 83 },
  { name: 'Габриэл Магальяэс', flag: '🇧🇷', pos: 'DF', rating: 83 }, { name: 'Данило', flag: '🇧🇷', pos: 'DF', rating: 82 },
  // 🇦🇷 Аргентина
  { name: 'Эмилиано Мартинес', flag: '🇦🇷', pos: 'GK', rating: 86 }, { name: 'Кристиан Ромеро', flag: '🇦🇷', pos: 'DF', rating: 85 },
  { name: 'Лисандро Мартинес', flag: '🇦🇷', pos: 'DF', rating: 85 }, { name: 'Оттаменди', flag: '🇦🇷', pos: 'DF', rating: 84 },
  { name: 'Энцо Фернандес', flag: '🇦🇷', pos: 'MF', rating: 85 }, { name: 'Де Пауль', flag: '🇦🇷', pos: 'MF', rating: 83 },
  { name: 'Мак Аллистер', flag: '🇦🇷', pos: 'MF', rating: 84 }, { name: 'Лаутаро Мартинес', flag: '🇦🇷', pos: 'FW', rating: 87 },
  { name: 'Месси', flag: '🇦🇷', pos: 'FW', rating: 98 }, { name: 'Хулиан Альварес', flag: '🇦🇷', pos: 'FW', rating: 87 },
  { name: 'Ди Мария', flag: '🇦🇷', pos: 'FW', rating: 84 }, { name: 'Анджело Ди Мария', flag: '🇦🇷', pos: 'MF', rating: 82 },
  // 🇫🇷 Франция
  { name: 'Меньян', flag: '🇫🇷', pos: 'GK', rating: 85 }, { name: 'Салиба', flag: '🇫🇷', pos: 'DF', rating: 86 },
  { name: 'Конате', flag: '🇫🇷', pos: 'DF', rating: 84 }, { name: 'Упамекано', flag: '🇫🇷', pos: 'DF', rating: 84 },
  { name: 'Чуамени', flag: '🇫🇷', pos: 'MF', rating: 84 }, { name: 'Канте', flag: '🇫🇷', pos: 'MF', rating: 84 },
  { name: 'Гризманн', flag: '🇫🇷', pos: 'MF', rating: 94 }, { name: 'Рабьо', flag: '🇫🇷', pos: 'MF', rating: 83 },
  { name: 'Мбаппе', flag: '🇫🇷', pos: 'FW', rating: 96 }, { name: 'Дембеле', flag: '🇫🇷', pos: 'FW', rating: 84 },
  { name: 'Жиру', flag: '🇫🇷', pos: 'FW', rating: 82 }, { name: 'Гендузи', flag: '🇫🇷', pos: 'MF', rating: 82 },
  // 🇵🇹 Португалия
  { name: 'Диогу Кошта', flag: '🇵🇹', pos: 'GK', rating: 85 }, { name: 'Рубен Диас', flag: '🇵🇹', pos: 'DF', rating: 87 },
  { name: 'Канселу', flag: '🇵🇹', pos: 'DF', rating: 85 }, { name: 'Пепе', flag: '🇵🇹', pos: 'DF', rating: 80 },
  { name: 'Бруну Фернандеш', flag: '🇵🇹', pos: 'MF', rating: 88 }, { name: 'Бернарду Силва', flag: '🇵🇹', pos: 'MF', rating: 87 },
  { name: 'Витинья', flag: '🇵🇹', pos: 'MF', rating: 84 }, { name: 'Пальинья', flag: '🇵🇹', pos: 'MF', rating: 84 },
  { name: 'Роналду', flag: '🇵🇹', pos: 'FW', rating: 99 }, { name: 'Леао', flag: '🇵🇹', pos: 'FW', rating: 86 },
  { name: 'Жота', flag: '🇵🇹', pos: 'FW', rating: 85 }, { name: 'Гонсалу Рамос', flag: '🇵🇹', pos: 'FW', rating: 83 },
  // 🇪🇸 Испания
  { name: 'Унаи Симон', flag: '🇪🇸', pos: 'GK', rating: 85 }, { name: 'Карвахаль', flag: '🇪🇸', pos: 'DF', rating: 86 },
  { name: 'Ляпорт', flag: '🇪🇸', pos: 'DF', rating: 85 }, { name: 'Начо', flag: '🇪🇸', pos: 'DF', rating: 83 },
  { name: 'Родри', flag: '🇪🇸', pos: 'MF', rating: 95 }, { name: 'Педри', flag: '🇪🇸', pos: 'MF', rating: 87 },
  { name: 'Гави', flag: '🇪🇸', pos: 'MF', rating: 85 }, { name: 'Фабиан Руис', flag: '🇪🇸', pos: 'MF', rating: 84 },
  { name: 'Ямаль', flag: '🇪🇸', pos: 'FW', rating: 86 }, { name: 'Мората', flag: '🇪🇸', pos: 'FW', rating: 83 },
  { name: 'Нико Уильямс', flag: '🇪🇸', pos: 'FW', rating: 84 }, { name: 'Ольмо', flag: '🇪🇸', pos: 'MF', rating: 84 },
  // 🇩🇪 Германия
  { name: 'Тер Стеген', flag: '🇩🇪', pos: 'GK', rating: 88 }, { name: 'Рюдигер', flag: '🇩🇪', pos: 'DF', rating: 85 },
  { name: 'Тах', flag: '🇩🇪', pos: 'DF', rating: 84 }, { name: 'Шлоттербек', flag: '🇩🇪', pos: 'DF', rating: 83 },
  { name: 'Киммих', flag: '🇩🇪', pos: 'MF', rating: 86 }, { name: 'Горетцка', flag: '🇩🇪', pos: 'MF', rating: 84 },
  { name: 'Муссиала', flag: '🇩🇪', pos: 'MF', rating: 87 }, { name: 'Вирц', flag: '🇩🇪', pos: 'MF', rating: 88 },
  { name: 'Хавертц', flag: '🇩🇪', pos: 'FW', rating: 83 }, { name: 'Сане', flag: '🇩🇪', pos: 'FW', rating: 84 },
  { name: 'Гнабри', flag: '🇩🇪', pos: 'FW', rating: 82 }, { name: 'Мюллер', flag: '🇩🇪', pos: 'FW', rating: 82 },
  // 🏴 Англия
  { name: 'Пикфорд', flag: '🏴', pos: 'GK', rating: 83 }, { name: 'Уокер', flag: '🏴', pos: 'DF', rating: 84 },
  { name: 'Стоунз', flag: '🏴', pos: 'DF', rating: 85 }, { name: 'Магуайр', flag: '🏴', pos: 'DF', rating: 79 },
  { name: 'Райс', flag: '🏴', pos: 'MF', rating: 87 }, { name: 'Беллингем', flag: '🏴', pos: 'MF', rating: 96 },
  { name: 'Фоден', flag: '🏴', pos: 'MF', rating: 87 }, { name: 'Палмер', flag: '🏴', pos: 'MF', rating: 86 },
  { name: 'Сака', flag: '🏴', pos: 'FW', rating: 88 }, { name: 'Кейн', flag: '🏴', pos: 'FW', rating: 95 },
  { name: 'Рашфорд', flag: '🏴', pos: 'FW', rating: 83 }, { name: 'Гордон', flag: '🏴', pos: 'FW', rating: 80 },
  // 🇮🇹 Италия
  { name: 'Доннарумма', flag: '🇮🇹', pos: 'GK', rating: 94 }, { name: 'Бастони', flag: '🇮🇹', pos: 'DF', rating: 85 },
  { name: 'Димарко', flag: '🇮🇹', pos: 'DF', rating: 84 }, { name: 'Акерби', flag: '🇮🇹', pos: 'DF', rating: 82 },
  { name: 'Барелла', flag: '🇮🇹', pos: 'MF', rating: 86 }, { name: 'Верратти', flag: '🇮🇹', pos: 'MF', rating: 84 },
  { name: 'Тонали', flag: '🇮🇹', pos: 'MF', rating: 83 }, { name: 'Жоржиньо', flag: '🇮🇹', pos: 'MF', rating: 82 },
  { name: 'Кьеза', flag: '🇮🇹', pos: 'FW', rating: 84 }, { name: 'Распадори', flag: '🇮🇹', pos: 'FW', rating: 80 },
  { name: 'Ретеги', flag: '🇮🇹', pos: 'FW', rating: 81 },
  // 🇳🇱 Нидерланды
  { name: 'Вербрюгген', flag: '🇳🇱', pos: 'GK', rating: 83 }, { name: 'Ван Дейк', flag: '🇳🇱', pos: 'DF', rating: 89 },
  { name: 'Аке', flag: '🇳🇱', pos: 'DF', rating: 84 }, { name: 'Де Лихт', flag: '🇳🇱', pos: 'DF', rating: 84 },
  { name: 'Френки де Йонг', flag: '🇳🇱', pos: 'MF', rating: 86 }, { name: 'Реиндерс', flag: '🇳🇱', pos: 'MF', rating: 84 },
  { name: 'Симонс', flag: '🇳🇱', pos: 'MF', rating: 84 }, { name: 'Гакпо', flag: '🇳🇱', pos: 'FW', rating: 85 },
  { name: 'Депай', flag: '🇳🇱', pos: 'FW', rating: 82 }, { name: 'Мален', flag: '🇳🇱', pos: 'FW', rating: 81 },
  // 🇭🇷 Хорватия
  { name: 'Ливакович', flag: '🇭🇷', pos: 'GK', rating: 83 }, { name: 'Гвардиол', flag: '🇭🇷', pos: 'DF', rating: 86 },
  { name: 'Суттало', flag: '🇭🇷', pos: 'DF', rating: 82 }, { name: 'Модрич', flag: '🇭🇷', pos: 'MF', rating: 86 },
  { name: 'Ковачич', flag: '🇭🇷', pos: 'MF', rating: 83 }, { name: 'Брозович', flag: '🇭🇷', pos: 'MF', rating: 84 },
  { name: 'Майер', flag: '🇭🇷', pos: 'MF', rating: 81 }, { name: 'Крамарич', flag: '🇭🇷', pos: 'FW', rating: 82 },
  { name: 'Петкович', flag: '🇭🇷', pos: 'FW', rating: 80 }, { name: 'Перишич', flag: '🇭🇷', pos: 'MF', rating: 81 },
  // 🇧🇪 Бельгия
  { name: 'Куртуа', flag: '🇧🇪', pos: 'GK', rating: 93 }, { name: 'Фас', flag: '🇧🇪', pos: 'DF', rating: 81 },
  { name: 'Кастань', flag: '🇧🇪', pos: 'DF', rating: 82 }, { name: 'Де Брюйне', flag: '🇧🇪', pos: 'MF', rating: 89 },
  { name: 'Тилеманс', flag: '🇧🇪', pos: 'MF', rating: 82 }, { name: 'Онана', flag: '🇧🇪', pos: 'MF', rating: 81 },
  { name: 'Доку', flag: '🇧🇪', pos: 'FW', rating: 84 }, { name: 'Тросар', flag: '🇧🇪', pos: 'FW', rating: 83 },
  { name: 'Лукаку', flag: '🇧🇪', pos: 'FW', rating: 82 }, { name: 'Опенда', flag: '🇧🇪', pos: 'FW', rating: 81 },
  // 🇵🇱 Польша
  { name: 'Щенсный', flag: '🇵🇱', pos: 'GK', rating: 82 }, { name: 'Кивёр', flag: '🇵🇱', pos: 'DF', rating: 80 },
  { name: 'Беднарек', flag: '🇵🇱', pos: 'DF', rating: 78 }, { name: 'Левандовски', flag: '🇵🇱', pos: 'FW', rating: 95 },
  { name: 'Зелиньски', flag: '🇵🇱', pos: 'MF', rating: 84 }, { name: 'Свидерский', flag: '🇵🇱', pos: 'FW', rating: 79 },
  // 🇳🇴 Норвегия
  { name: 'Эдегор', flag: '🇳🇴', pos: 'MF', rating: 87 }, { name: 'Хааланд', flag: '🇳🇴', pos: 'FW', rating: 96 },
  { name: 'Сёрлот', flag: '🇳🇴', pos: 'FW', rating: 81 }, { name: 'Берге', flag: '🇳🇴', pos: 'MF', rating: 80 },
  // 🇲🇦 Марокко
  { name: 'Буну', flag: '🇲🇦', pos: 'GK', rating: 83 }, { name: 'Хакими', flag: '🇲🇦', pos: 'DF', rating: 87 },
  { name: 'Агерд', flag: '🇲🇦', pos: 'DF', rating: 82 }, { name: 'Зиеш', flag: '🇲🇦', pos: 'MF', rating: 82 },
  { name: 'Амрабат', flag: '🇲🇦', pos: 'MF', rating: 82 }, { name: 'Эн-Несири', flag: '🇲🇦', pos: 'FW', rating: 80 },
  // 🇯🇵 Япония
  { name: 'Томиясу', flag: '🇯🇵', pos: 'DF', rating: 80 }, { name: 'Итакура', flag: '🇯🇵', pos: 'DF', rating: 79 },
  { name: 'Эндо', flag: '🇯🇵', pos: 'MF', rating: 79 }, { name: 'Кубо', flag: '🇯🇵', pos: 'FW', rating: 80 },
  { name: 'Митома', flag: '🇯🇵', pos: 'FW', rating: 82 }, { name: 'Камада', flag: '🇯🇵', pos: 'MF', rating: 78 },
  // 🇰🇷 Корея
  { name: 'Сон Хынмин', flag: '🇰🇷', pos: 'FW', rating: 94 }, { name: 'Ким Минджэ', flag: '🇰🇷', pos: 'DF', rating: 84 },
  { name: 'Ли Кан Ин', flag: '🇰🇷', pos: 'MF', rating: 81 }, { name: 'Хван Хичан', flag: '🇰🇷', pos: 'FW', rating: 78 },
  // 🇷🇺 Россия (низкие рейтинги для бронзы)
  { name: 'Сафонов', flag: '🇷🇺', pos: 'GK', rating: 79 }, { name: 'Максименко', flag: '🇷🇺', pos: 'GK', rating: 75 },
  { name: 'Дивеев', flag: '🇷🇺', pos: 'DF', rating: 78 }, { name: 'Кудряшов', flag: '🇷🇺', pos: 'DF', rating: 76 },
  { name: 'Головин', flag: '🇷🇺', pos: 'MF', rating: 79 }, { name: 'Обляков', flag: '🇷🇺', pos: 'MF', rating: 77 },
  { name: 'Сперцян', flag: '🇷🇺', pos: 'MF', rating: 77 }, { name: 'Миранчук', flag: '🇷🇺', pos: 'MF', rating: 76 },
  { name: 'Тюкавин', flag: '🇷🇺', pos: 'FW', rating: 79 }, { name: 'Пиняев', flag: '🇷🇺', pos: 'FW', rating: 78 },
  { name: 'Сергеев', flag: '🇷🇺', pos: 'FW', rating: 76 }, { name: 'Агаларов', flag: '🇷🇺', pos: 'FW', rating: 75 },
  // 🇺🇦 Украина
  { name: 'Лунин', flag: '🇺🇦', pos: 'GK', rating: 81 }, { name: 'Матвиенко', flag: '🇺🇦', pos: 'DF', rating: 79 },
  { name: 'Забарный', flag: '🇺🇦', pos: 'DF', rating: 78 }, { name: 'Зинченко', flag: '🇺🇦', pos: 'DF', rating: 79 },
  { name: 'Судаков', flag: '🇺🇦', pos: 'MF', rating: 78 }, { name: 'Шапаренко', flag: '🇺🇦', pos: 'MF', rating: 76 },
  { name: 'Довбик', flag: '🇺🇦', pos: 'FW', rating: 80 }, { name: 'Цыганков', flag: '🇺🇦', pos: 'FW', rating: 79 },
  { name: 'Мудрик', flag: '🇺🇦', pos: 'FW', rating: 79 }, { name: 'Ярмоленко', flag: '🇺🇦', pos: 'MF', rating: 75 },
  // Молодые и низкорейтинговые (бронза-серебро) — чтобы в пуле всегда были простые игроки
  { name: 'Эван Фергюсон', flag: '🇮🇪', pos: 'FW', rating: 74 }, { name: 'Нельссон', flag: '🇩🇰', pos: 'DF', rating: 75 },
  { name: 'Орье', flag: '🇨🇮', pos: 'DF', rating: 78 }, { name: 'Лаймер', flag: '🇦🇹', pos: 'MF', rating: 79 },
  { name: 'Осимхен', flag: '🇳🇬', pos: 'FW', rating: 84 }, { name: 'Ихэаначо', flag: '🇳🇬', pos: 'FW', rating: 76 },
  { name: 'Кудус', flag: '🇬🇭', pos: 'MF', rating: 80 }, { name: 'Папе Сарр', flag: '🇸🇳', pos: 'MF', rating: 77 },
  { name: 'Менди', flag: '🇸🇳', pos: 'GK', rating: 82 }, { name: 'Диаките', flag: '🇸🇳', pos: 'DF', rating: 78 },
  { name: 'Селихов', flag: '🇷🇺', pos: 'GK', rating: 70 }, { name: 'Умяров', flag: '🇷🇺', pos: 'MF', rating: 70 },
  { name: 'Набабкин', flag: '🇷🇺', pos: 'DF', rating: 69 }, { name: 'Заболотный', flag: '🇷🇺', pos: 'FW', rating: 69 },
  { name: 'Осипенко', flag: '🇷🇺', pos: 'DF', rating: 68 }, { name: 'Шапи', flag: '🇷🇺', pos: 'FW', rating: 68 },
  { name: 'Кучаев', flag: '🇷🇺', pos: 'MF', rating: 67 }, { name: 'Чернов', flag: '🇷🇺', pos: 'DF', rating: 66 },
  { name: 'Игнатьев', flag: '🇷🇺', pos: 'FW', rating: 66 }, { name: 'Куликов', flag: '🇷🇺', pos: 'MF', rating: 65 },
  { name: 'Помазун', flag: '🇷🇺', pos: 'GK', rating: 64 }, { name: 'Евгеньев', flag: '🇷🇺', pos: 'DF', rating: 64 },
  { name: 'Сычевой', flag: '🇷🇺', pos: 'FW', rating: 63 }, { name: 'Литвинов', flag: '🇷🇺', pos: 'MF', rating: 63 },
  { name: 'Горшков', flag: '🇷🇺', pos: 'DF', rating: 62 }, { name: 'Коваленко', flag: '🇺🇦', pos: 'FW', rating: 72 },
  // 🧤 Вратари и защитники (дополнительно к основному пулу)
  { name: 'Шмейхель', flag: '🇩🇰', pos: 'GK', rating: 82 }, { name: 'Нойер', flag: '🇩🇪', pos: 'GK', rating: 89 },
  { name: 'Нюланд', flag: '🇳🇴', pos: 'GK', rating: 78 }, { name: 'Флеккен', flag: '🇳🇱', pos: 'GK', rating: 80 },
  { name: 'Ваня Милинкович', flag: '🇷🇸', pos: 'GK', rating: 79 }, { name: 'Рая', flag: '🇪🇸', pos: 'GK', rating: 82 },
  { name: 'Кастелс', flag: '🇧🇪', pos: 'GK', rating: 80 }, { name: 'Андерсен', flag: '🇩🇰', pos: 'DF', rating: 80 },
  { name: 'Кристенсен', flag: '🇩🇰', pos: 'DF', rating: 81 }, { name: 'Коулман', flag: '🇮🇪', pos: 'DF', rating: 78 },
  { name: 'Гримальдо', flag: '🇪🇸', pos: 'DF', rating: 83 }, { name: 'Уокер-Питерс', flag: '🏴', pos: 'DF', rating: 77 },
  { name: 'Вендел', flag: '🇧🇷', pos: 'DF', rating: 76 }, { name: 'Тальби', flag: '🇹🇳', pos: 'DF', rating: 74 },
  { name: 'Сарр', flag: '🇸🇳', pos: 'DF', rating: 75 }, { name: 'Картер-Викерс', flag: '🇺🇸', pos: 'DF', rating: 72 },
  // ⭐ Полузащитники и нападение (больше звёзд)
  { name: 'Андре', flag: '🇧🇷', pos: 'MF', rating: 78 }, { name: 'Харви Эллиотт', flag: '🏴', pos: 'MF', rating: 76 },
  { name: 'Отавио', flag: '🇵🇹', pos: 'MF', rating: 82 }, { name: 'Бергвалль', flag: '🇸🇪', pos: 'MF', rating: 76 },
  { name: 'Хендерсон', flag: '🏴', pos: 'MF', rating: 79 }, { name: 'Смит-Роу', flag: '🏴', pos: 'MF', rating: 77 },
  { name: 'Гудмундссон', flag: '🇮🇸', pos: 'MF', rating: 75 }, { name: 'Макклин', flag: '🇮🇪', pos: 'MF', rating: 72 },
  { name: 'Джейкоб Мерфи', flag: '🏴', pos: 'MF', rating: 71 }, { name: 'Армстронг', flag: '🏴', pos: 'FW', rating: 73 },
  { name: 'Кифер Мур', flag: '🏴', pos: 'FW', rating: 72 }, { name: 'Шейн Лонг', flag: '🇮🇪', pos: 'FW', rating: 72 },
  { name: 'Демарай Грей', flag: '🏴', pos: 'FW', rating: 73 }, { name: 'Берг', flag: '🇳🇴', pos: 'FW', rating: 76 },
  { name: 'Желсон Мартинс', flag: '🇵🇹', pos: 'FW', rating: 79 }, { name: 'Сёуль', flag: '🇳🇴', pos: 'FW', rating: 78 },
  // 🎖 Премиум-звёзды (diamond/secret) — больше топ-игроков в пуле
  { name: 'Лампард', flag: '🏴', pos: 'MF', rating: 88 }, { name: 'Джерард', flag: '🏴', pos: 'MF', rating: 89 },
  { name: 'Терри', flag: '🏴', pos: 'DF', rating: 86 }, { name: 'Фердинанд', flag: '🏴', pos: 'DF', rating: 86 },
  { name: 'Стерлинг', flag: '🏴', pos: 'FW', rating: 85 }, { name: 'Рио', flag: '🏴', pos: 'DF', rating: 84 },
  { name: 'Луис Суарес', flag: '🇺🇾', pos: 'FW', rating: 88 }, { name: 'Кавани', flag: '🇺🇾', pos: 'FW', rating: 87 },
  { name: 'Вальверде', flag: '🇺🇾', pos: 'MF', rating: 85 }, { name: 'Араухо', flag: '🇺🇾', pos: 'DF', rating: 85 },
  { name: 'Видаль', flag: '🇨🇱', pos: 'MF', rating: 83 }, { name: 'Санчес', flag: '🇨🇱', pos: 'FW', rating: 84 },
  { name: 'Медель', flag: '🇨🇱', pos: 'DF', rating: 80 }, { name: 'Хименес', flag: '🇲🇽', pos: 'DF', rating: 82 },
  { name: 'Эдсон Альварес', flag: '🇲🇽', pos: 'MF', rating: 81 }, { name: 'Гонсалес', flag: '🇲🇽', pos: 'GK', rating: 79 },
  { name: 'Очоа', flag: '🇲🇽', pos: 'GK', rating: 81 }, { name: 'Лосано', flag: '🇲🇽', pos: 'FW', rating: 80 },
  // 🎖 Дания, Швеция, Ирландия — доп. топ-имена
  { name: 'Хойлунд', flag: '🇩🇰', pos: 'FW', rating: 84 }, { name: 'Эриксен', flag: '🇩🇰', pos: 'MF', rating: 85 },
  { name: 'Кьё', flag: '🇩🇰', pos: 'DF', rating: 82 }, { name: 'Исак', flag: '🇸🇪', pos: 'FW', rating: 87 },
  { name: 'Кулусевски', flag: '🇸🇪', pos: 'MF', rating: 84 }, { name: 'Линделёф', flag: '🇸🇪', pos: 'DF', rating: 81 },
  { name: 'Обраен', flag: '🇮🇪', pos: 'DF', rating: 75 }, { name: 'Моламби', flag: '🇧🇪', pos: 'MF', rating: 76 },
  // 🎖 Южная Америка и другие звезды
  { name: 'Нуньес', flag: '🇺🇾', pos: 'FW', rating: 86 }, { name: 'Вега', flag: '🇺🇾', pos: 'MF', rating: 80 },
  { name: 'Ганди', flag: '🇨🇴', pos: 'MF', rating: 84 }, { name: 'Диас', flag: '🇨🇴', pos: 'FW', rating: 85 },
  { name: 'Кордоба', flag: '🇨🇴', pos: 'FW', rating: 83 }, { name: 'Ариас', flag: '🇨🇴', pos: 'MF', rating: 80 },
  { name: 'Эспиноза', flag: '🇪🇨', pos: 'DF', rating: 79 }, { name: 'Эррера', flag: '🇪🇨', pos: 'MF', rating: 79 },
  { name: 'Валенсия', flag: '🇪🇨', pos: 'FW', rating: 82 }, { name: 'Кайседо', flag: '🇪🇨', pos: 'MF', rating: 85 },
  { name: 'Дибула', flag: '🇦🇷', pos: 'FW', rating: 88 },
  // 🎖 Завершающие (легкие и средние)
  { name: 'Холгейт', flag: '🏴', pos: 'DF', rating: 76 }, { name: 'Тарковски', flag: '🏴', pos: 'DF', rating: 79 },
  { name: 'Р. Джеймс', flag: '🏴', pos: 'DF', rating: 84 }, { name: 'Томори', flag: '🏴', pos: 'DF', rating: 78 },
  { name: 'Лукас Пачета', flag: '🇧🇷', pos: 'MF', rating: 84 }, { name: 'Туре', flag: '🇬🇳', pos: 'MF', rating: 82 },
  { name: 'Бейл', flag: '🏴', pos: 'FW', rating: 86 }, { name: 'Джек Грилиш', flag: '🏴', pos: 'MF', rating: 85 }, { name: 'Маунт', flag: '🏴', pos: 'MF', rating: 84 },
  { name: 'Гарри Магуайр', flag: '🏴', pos: 'DF', rating: 80 }, { name: 'Триппьер', flag: '🏴', pos: 'DF', rating: 83 },
  { name: 'Рэшфорд', flag: '🏴', pos: 'FW', rating: 84 },
  // 🎖 Легенды Латинской Америки
  { name: 'Фарфан', flag: '🇵🇪', pos: 'FW', rating: 84 }, { name: 'Каррильо', flag: '🇵🇪', pos: 'MF', rating: 82 },
  { name: 'Герреро', flag: '🇵🇪', pos: 'FW', rating: 83 }, { name: 'Гальесе', flag: '🇵🇪', pos: 'GK', rating: 80 },
  { name: 'Хамес', flag: '🇨🇴', pos: 'MF', rating: 85 }, { name: 'Мина', flag: '🇨🇴', pos: 'DF', rating: 82 },
  { name: 'Муриэль', flag: '🇨🇴', pos: 'FW', rating: 81 }, { name: 'Кардона', flag: '🇨🇴', pos: 'MF', rating: 79 },
  { name: 'Варгас', flag: '🇨🇴', pos: 'GK', rating: 78 }, { name: 'Навас', flag: '🇨🇷', pos: 'GK', rating: 85 },
  // 🎖 Защитники Италия
  { name: 'Кьеллини', flag: '🇮🇹', pos: 'DF', rating: 84 }, { name: 'Бонуччи', flag: '🇮🇹', pos: 'DF', rating: 84 },
  { name: 'Скамакка', flag: '🇮🇹', pos: 'FW', rating: 82 }, { name: 'Дзаньоло', flag: '🇮🇹', pos: 'MF', rating: 82 },
  { name: 'Локателли', flag: '🇮🇹', pos: 'MF', rating: 81 }, { name: 'Буффон', flag: '🇮🇹', pos: 'GK', rating: 86 },
  { name: 'Зема', flag: '🇮🇹', pos: 'MF', rating: 80 }, { name: 'Кьеза мл.', flag: '🇮🇹', pos: 'FW', rating: 84 },
  { name: 'Пеллегрини', flag: '🇮🇹', pos: 'FW', rating: 83 }, { name: 'Политано', flag: '🇮🇹', pos: 'FW', rating: 81 },
  // 🎖 Кумиры (БИНГИ, 101-110) — легенды футбола, недоступны обычными редкостями
  { name: 'Пеле', flag: '🇧🇷', pos: 'FW', rating: 110 },
  { name: 'Марадона', flag: '🇦🇷', pos: 'FW', rating: 109 },
  { name: 'Месси Кумир', flag: '🇦🇷', pos: 'FW', rating: 108 },
  { name: 'Роналду Кумир', flag: '🇵🇹', pos: 'FW', rating: 108 },
  { name: 'Зидан', flag: '🇫🇷', pos: 'MF', rating: 105 },
  { name: 'Роналдиньо', flag: '🇧🇷', pos: 'MF', rating: 103 },
  { name: 'Кройф', flag: '🇳🇱', pos: 'MF', rating: 102 },
  { name: 'Платини', flag: '🇫🇷', pos: 'MF', rating: 101 },
  { name: 'Бекхенбауэр', flag: '🇩🇪', pos: 'DF', rating: 102 },
  { name: 'Мальдини', flag: '🇮🇹', pos: 'DF', rating: 101 },
  { name: 'Яшин', flag: '🇷🇺', pos: 'GK', rating: 101 },
];

const NATIONS = {};
