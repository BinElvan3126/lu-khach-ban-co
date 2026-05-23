import './styles/prototype.css';
import cardsBundle from './data/cards_bundle.json';
import { MultiplayerClient } from './client/multi';
import { createBoard, cellId, DAYS, TIME_SLOTS, validateGridPlacement, placeCardOnBoard, skipBoardSlot } from './shared/game/board';
import { STARTING_RESOURCES, applyOnPlayEffects, gainRestResources, payDraftCost, validateCardUsage } from './shared/game/rules';
import { boardToTimeline, calculateScore } from './shared/game/score';
import type { GridPosition, PlayerState, RoomSnapshot, TravelCard } from './shared/game/types';
import {
  currentCloudUser,
  isFirebaseConfigured,
  loadCloudHistory,
  loadCloudProfile,
  loadCloudRankings,
  loginWithEmail,
  logoutCloudUser,
  registerWithEmail,
  saveCloudMatchResult,
  saveCloudProfile,
  type CloudHistory,
  type CloudRanking,
} from './shared/cloud/firebase';

const cards = cardsBundle as TravelCard[];
const multiplayer = new MultiplayerClient();
let playerId = getOrCreatePlayerId();

type Screen = 'login' | 'hub' | 'ranking' | 'history' | 'explore' | 'settings' | 'matching' | 'game' | 'result';

type GameState = {
  screen: Screen;
  statusText: string;
  selectedCardId?: string;
  previewCardId?: string;
  draftPreviewCardId?: string;
  draggingCardId?: string;
  dragOverSlotId?: string;
  selectedSlot?: GridPosition;
  selectedRegion: string;
  soundEnabled: boolean;
  language: string;
  authMode: 'signin' | 'register';
  player: PlayerState;
  snapshot?: RoomSnapshot;
  message?: string;
  cloudRankings?: CloudRanking[];
  cloudHistory?: CloudHistory[];
  cloudLoaded: {
    profile: boolean;
    rankings: boolean;
    history: boolean;
  };
  savedResultIds: string[];
};

const state: GameState = {
  screen: 'login',
  statusText: 'Ready',
  selectedRegion: 'SAIGON',
  soundEnabled: localStorage.getItem('lkbc.sound') !== 'off',
  language: localStorage.getItem('lkbc.language') ?? 'English',
  authMode: 'signin',
  player: createPlayer(),
  cloudLoaded: {
    profile: false,
    rankings: false,
    history: false,
  },
  savedResultIds: [],
};

multiplayer.onStatus((status) => {
  if (status === 'connecting') state.statusText = 'Finding players...';
  if (status === 'connected') state.statusText = 'Finding players...';
  if (status === 'error' || status === 'offline') {
    state.statusText = 'Could not join a match. Please try again.';
    state.message = 'Matchmaking is unavailable right now.';
  }
  render();
});

multiplayer.onError((message) => {
  state.message = message.includes('Room') ? 'Matchmaking is unavailable right now.' : message;
  render();
});

multiplayer.onSnapshot((snapshot) => {
  state.snapshot = snapshot;
  const player = snapshot.players.find((item) => item.playerId === playerId);
  if (player) state.player = player;

  if (snapshot.phase === 'finished') {
    state.screen = 'result';
  } else if (snapshot.phase === 'lobby') {
    state.screen = 'matching';
    state.statusText = snapshot.players.length >= 2 ? 'Starting soon...' : 'Finding players...';
  } else {
    state.screen = 'game';
    state.statusText = currentPlayerReady() ? 'Waiting for others...' : 'Your pick';
  }
  render();
});

document.querySelector<HTMLDivElement>('#root')!.innerHTML = '<main id="app" class="app-shell"></main><div id="modalRoot"></div>';
document.addEventListener('dragstart', handleDragStart);
document.addEventListener('dragend', handleDragEnd);
document.addEventListener('keydown', handleHiddenShortcuts);
render();
void hydrateCloudProfile();

function render() {
  const app = document.querySelector('#app')!;
  if (state.screen === 'login') app.innerHTML = loginScreen();
  if (state.screen === 'hub') app.innerHTML = hubScreen();
  if (state.screen === 'ranking') app.innerHTML = rankingScreen();
  if (state.screen === 'history') app.innerHTML = historyScreen();
  if (state.screen === 'explore') app.innerHTML = exploreScreen();
  if (state.screen === 'settings') app.innerHTML = settingsScreen();
  if (state.screen === 'matching') app.innerHTML = matchingScreen();
  if (state.screen === 'game') app.innerHTML = gameScreen();
  if (state.screen === 'result') app.innerHTML = resultScreen();

  bindScreenActions();
  renderCardModal();
  renderDraftOverlay();
  if (state.screen === 'ranking') void hydrateCloudRankings();
  if (state.screen === 'history') void hydrateCloudHistory();
  if (state.screen === 'result') void persistFinishedMatch();
}

function loginScreen() {
  const isRegistering = state.authMode === 'register';
  return `
    <section class="landing-screen">
      ${ambientScene()}
      <div class="landing-card">
        <p class="eyebrow">Guild Registry</p>
        <h1>${isRegistering ? 'Create a Traveler Account' : "Sign in to the Traveler's Hall"}</h1>
        <p>${isRegistering ? 'Create your expedition account once, then keep your rankings, history, and travel logs in the cloud.' : 'Sign in with your expedition account. Your rankings, history, and travel logs will follow you from any device.'}</p>
        ${!isFirebaseConfigured() ? '<p class="soft-message">Firebase is not configured yet. Add your Firebase keys in .env before players can sign in.</p>' : ''}
        ${isRegistering ? registerFormMarkup() : signInFormMarkup()}
        ${state.message ? `<p class="soft-message">${state.message}</p>` : ''}
      </div>
    </section>
  `;
}

function signInFormMarkup() {
  return `
    <form id="loginForm" class="guest-form auth-form">
      <label>
        Email
        <input id="loginEmailInput" type="email" autocomplete="email" placeholder="traveler@email.com" required />
      </label>
      <label>
        Password
        <input id="loginPasswordInput" type="password" autocomplete="current-password" minlength="6" placeholder="At least 6 characters" required />
      </label>
      <button class="primary-action" type="submit">Sign In</button>
      <button id="showRegisterBtn" class="auth-link-action" type="button">Create new account</button>
    </form>
  `;
}

function registerFormMarkup() {
  return `
    <form id="registerForm" class="guest-form auth-form">
      <label>
        Adventurer name
        <input id="registerNameInput" maxlength="24" autocomplete="name" placeholder="Traveler name" required />
      </label>
      <label>
        Email
        <input id="registerEmailInput" type="email" autocomplete="email" placeholder="traveler@email.com" required />
      </label>
      <label>
        Password
        <input id="registerPasswordInput" type="password" autocomplete="new-password" minlength="6" placeholder="At least 6 characters" required />
      </label>
      <button class="primary-action" type="submit">Register Account</button>
      <button id="showSignInBtn" class="auth-link-action" type="button">Already have an account? Sign in</button>
    </form>
  `;
}

function hubScreen() {
  const categories = [...new Set(cards.flatMap((card) => card.tags))].slice(0, 6);
  const navItems: Array<{ screen?: Screen; id?: string; title: string; kicker: string }> = [
    { screen: 'login', title: 'Login', kicker: 'Traveler registry' },
    { id: 'playBtn', title: 'Play', kicker: 'Gather party' },
    { screen: 'explore', title: 'Explore', kicker: 'Travel packs' },
    { screen: 'ranking', title: 'Ranking', kicker: 'Guild honors' },
    { screen: 'history', title: 'History', kicker: 'Old expeditions' },
    { screen: 'settings', title: 'Settings', kicker: 'Camp options' },
  ];

  return `
    <section class="landing-screen">
      ${ambientScene()}
      <div class="landing-card">
        <p class="eyebrow">Grand Guild Hall</p>
        <h1>Lu Khach Ban Co</h1>
        <p>A legendary fellowship of travelers planning grand expeditions across Vietnam. Study and inspect old routes, then gather a party when you press Play.</p>
        <div class="hub-preview">
          ${categories.map((tag) => `<span>${tag}</span>`).join('')}
        </div>
        <div class="hub-menu">
          ${navItems.map(hubNavButton).join('')}
        </div>
        ${state.message ? `<p class="soft-message">${state.message}</p>` : ''}
      </div>
    </section>
  `;
}

function hubNavButton(item: { screen?: Screen; id?: string; title: string; kicker: string }) {
  const screenAttr = item.screen ? ` data-nav-screen="${item.screen}"` : '';
  const idAttr = item.id ? ` id="${item.id}"` : '';
  const playClass = item.id === 'playBtn' ? ' primary-action nav-play' : '';
  return `
    <button${idAttr}${screenAttr} class="nav-rune${playClass}">
      <span>${item.kicker}</span>
      <strong>${item.title}</strong>
    </button>
  `;
}

function rankingScreen() {
  const rows = state.cloudRankings?.length ? state.cloudRankings : mockRankings();
  return hubDetailShell(
    'Ranking',
    'Guild leaderboard',
    `
      ${cloudStatusNote()}
      <div class="leaderboard">
        ${rows.map((row, index) => `
          <article class="leader-row">
            <span class="rank-number">#${index + 1}</span>
            <strong>${row.name}</strong>
            <span>${row.totalWins} wins</span>
            <span>${row.highestVp} VP best</span>
            <small>${row.recent}</small>
          </article>
        `).join('')}
      </div>
    `,
  );
}

function historyScreen() {
  const rows = state.cloudHistory ?? readLocalHistory();
  return hubDetailShell(
    'History',
    'Adventurer archive',
    `
      ${cloudStatusNote()}
      ${
        rows.length
          ? `<div class="history-list">${rows.map(historyCardMarkup).join('')}</div>`
          : `<article class="history-card empty-history">
              <p class="eyebrow">No expeditions yet</p>
              <h3>No saved trip history</h3>
              <p>Finish a match first. Your Royal Expedition Journal will be saved here with its real itinerary timeline.</p>
            </article>`
      }
    `,
  );
}

function historyCardMarkup(row: CloudHistory) {
  const timeline = row.timeline?.length
    ? `<div class="history-timeline-preview">
        ${row.timeline.slice(0, 4).map((entry) => `
          <span>Day ${entry.day} / ${labelSlot(entry.slot)} - ${entry.title}</span>
        `).join('')}
        ${row.timeline.length > 4 ? `<small>+${row.timeline.length - 4} more stops</small>` : ''}
      </div>`
    : `<p>${row.itinerary}</p>`;

  return `
    <article class="history-card">
      <p class="eyebrow">${row.date}</p>
      <h3>${row.destination}</h3>
      ${timeline}
      <div class="history-meta">
        <span>${row.finalVp} VP</span>
        <button class="quiet-action" data-history-id="${row.id}">View Detail</button>
      </div>
    </article>
  `;
}

function exploreScreen() {
  const regions = ['SAIGON', 'HANOI', 'DA_NANG', 'HOI_AN', 'SAPA', 'DA_LAT'];
  const browseCards = cards.filter((card) => (card.phase_pool ?? 'SAIGON') === state.selectedRegion);
  return hubDetailShell(
    'Explore',
    'Travel codex and regional card packs',
    `
      <div class="region-tabs">
        ${regions.map((region) => `<button class="${region === state.selectedRegion ? 'active' : ''}" data-region="${region}">${region.replace(/_/g, ' ')}</button>`).join('')}
      </div>
      <div class="explore-grid">
        ${
          browseCards.length
            ? browseCards.slice(0, 12).map((card) => `
              <article class="explore-card">
                <p class="eyebrow">${card.tags.slice(0, 2).join(' / ')}</p>
                <h3>${card.name}</h3>
                <p>${card.description ?? 'Travel card for itinerary planning.'}</p>
                <div class="explore-stats">
                  <span>${card.cost} Xu</span>
                  <span>${card.stamina} Stamina</span>
                  <span>${card.victory_point} VP</span>
                </div>
                <small>${card.on_play_effect}</small>
              </article>
            `).join('')
            : '<p class="helper">This regional pack is coming soon.</p>'
        }
      </div>
    `,
  );
}

function settingsScreen() {
  return hubDetailShell(
    'Settings',
    'Guild preferences',
    `
      <form id="settingsForm" class="settings-form">
        <label>
          Display name
          <input id="displayNameInput" maxlength="24" value="${escapeHtml(playerName())}" />
        </label>
        <label>
          Language
          <select id="languageInput">
            <option ${state.language === 'English' ? 'selected' : ''}>English</option>
            <option ${state.language === 'Vietnamese' ? 'selected' : ''}>Vietnamese</option>
          </select>
        </label>
        <label class="switch-row">
          Sound
          <input id="soundInput" type="checkbox" ${state.soundEnabled ? 'checked' : ''} />
        </label>
        <button class="primary-action" type="submit">Save Settings</button>
        <button id="resetLocalDataBtn" class="quiet-action" type="button">Sign Out</button>
      </form>
    `,
  );
}

function hubDetailShell(eyebrow: string, title: string, content: string) {
  return `
    <section class="hub-detail-screen">
      ${ambientScene()}
      <div class="hub-detail-card">
        <div class="detail-header">
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h1>${title}</h1>
          </div>
          <button id="backToHubNavBtn" class="quiet-action">Back to Hub</button>
        </div>
        ${content}
      </div>
    </section>
  `;
}

function matchingScreen() {
  const players = state.snapshot?.players ?? [state.player];
  const count = players.length;
  return `
    <section class="match-screen">
      ${ambientScene()}
      <div class="match-card">
        <p class="eyebrow">Expedition Table</p>
        <h1>${state.statusText === 'Finding players...' ? 'Searching for travelers...' : state.statusText}</h1>
        <div class="matchmaking-stage">
          <div class="matching-rune" aria-hidden="true"><span></span></div>
          <div class="party-ledger">
            <p class="player-count">${count}/4 travelers joined</p>
            <div class="match-meter"><span style="width:${(count / 4) * 100}%"></span></div>
            <p class="match-note">${count >= 2 ? 'The expedition charter is almost ready.' : 'Open another browser tab and press Play to join this party.'}</p>
          </div>
        </div>
        <p class="eyebrow party-title">Party roster</p>
        <div class="player-list">
          ${players.map(playerRow).join('')}
        </div>
        ${state.message ? `<p class="soft-message">${state.message}</p>` : ''}
        ${state.message ? '<button id="backToHubBtn" class="quiet-action">Back to Hub</button>' : ''}
      </div>
    </section>
  `;
}

function gameScreen() {
  const snapshot = state.snapshot;
  const ready = currentPlayerReady();
  const phase = snapshot?.phase ?? 'draft';
  return `
    <section class="game-topbar">
      <div>
        <p class="eyebrow">Expedition in progress</p>
        <h1>Day ${snapshot?.day ?? 1}/${DAYS.length}</h1>
      </div>
      <p class="turn-pill">${ready ? 'Waiting for others' : phaseLabel(phase)}</p>
    </section>
    ${phaseTracker(phase, snapshot?.phase === 'finished')}
    <section class="hud">
      ${hudCard('Phase', phase === 'placement' ? 'Plan' : `${Math.min((snapshot?.pickIndex ?? 0) + 1, 3)}/3`)}
      ${hudCard('Xu', state.player.resources.xu)}
      ${hudCard('Stamina', state.player.resources.stamina)}
      ${hudCard('Debt', state.player.resources.debtToken)}
      ${hudCard('VP', calculateScore(state.player.board, cards, state.player.resources).totalVp)}
      ${hudCard('Players', `${snapshot?.players.length ?? 1}/4`)}
    </section>
    <section class="game-layout">
      <aside class="panel hand-panel">
        <div class="panel-title">
          <p class="eyebrow">Personal storage</p>
          <h2>Stored cards</h2>
        </div>
        <div class="card-list">
          ${state.player.storage.length ? state.player.storage.map(cardButton).join('') : '<p class="helper">Draft choices will be stored here. In planning phase, drag them onto the board.</p>'}
        </div>
      </aside>
      <section class="panel board-panel">
        <div class="panel-title row">
          <div>
            <p class="eyebrow">Expedition table</p>
            <h2>5 days x 3 moments</h2>
          </div>
          <div class="board-actions">
            <button id="skipBtn" class="quiet-action">Rest Slot</button>
            <button id="endPlanningBtn" class="primary-action">Lock Day</button>
          </div>
        </div>
        <div id="board" class="board">${boardMarkup()}</div>
      </section>
      <aside class="panel">
        <div class="panel-title">
          <p class="eyebrow">Journey status</p>
          <h2>${ready ? 'Waiting' : phase === 'placement' ? 'Arrange storage' : 'Draft a card'}</h2>
        </div>
        ${scoreMarkup()}
        ${state.message ? `<p class="soft-message">${state.message}</p>` : ''}
        <div class="player-list compact">
          ${(snapshot?.players ?? [state.player]).map(playerRow).join('')}
        </div>
      </aside>
    </section>
  `;
}

function resultScreen() {
  const snapshot = state.snapshot;
  const winner = snapshot?.players.find((player) => player.playerId === snapshot.winnerId);
  const timeline = snapshot?.timeline ?? boardToTimeline(state.player.board, cards);
  return `
    <section class="result-screen">
      ${ambientScene()}
      <div class="result-card">
        <p class="eyebrow">Royal Expedition Journal</p>
        <h1>${winner ? `${winner.name} wins` : 'Final itinerary'}</h1>
        <p>${winner ? 'The winning board has been sealed into a travel logbook.' : 'Your board is ready as a travel logbook.'}</p>
        <div class="timeline-list">
          ${timeline.length ? timeline.map((entry) => `
            <article class="timeline-item">
              <p class="eyebrow">Day ${entry.day} / ${entry.slot}</p>
              <h3>${entry.title}</h3>
              <p>${entry.note}</p>
              <small>${entry.estimatedCost.toLocaleString()} VND</small>
            </article>
          `).join('') : '<p class="helper">No itinerary was created.</p>'}
        </div>
        <div class="result-actions">
          <button id="exportPdfBtn" class="primary-action">Export PDF Seal</button>
          <button id="playAgainBtn" class="quiet-action">Return to Guild Hall</button>
        </div>
      </div>
    </section>
  `;
}

function bindScreenActions() {
  document.querySelector('#loginForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = document.querySelector<HTMLInputElement>('#loginEmailInput')?.value ?? '';
    const password = document.querySelector<HTMLInputElement>('#loginPasswordInput')?.value ?? '';
    void signInAccount(email, password);
  });
  document.querySelector('#registerForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#registerNameInput')?.value ?? '';
    const email = document.querySelector<HTMLInputElement>('#registerEmailInput')?.value ?? '';
    const password = document.querySelector<HTMLInputElement>('#registerPasswordInput')?.value ?? '';
    void registerAccount(name, email, password);
  });
  document.querySelector('#showRegisterBtn')?.addEventListener('click', () => {
    state.authMode = 'register';
    state.message = undefined;
    render();
  });
  document.querySelector('#showSignInBtn')?.addEventListener('click', () => {
    state.authMode = 'signin';
    state.message = undefined;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-nav-screen]').forEach((button) => {
    button.addEventListener('click', () => {
      state.screen = (button.dataset.navScreen as Screen) ?? 'hub';
      state.message = undefined;
      render();
    });
  });
  document.querySelector('#backToHubNavBtn')?.addEventListener('click', () => {
    state.screen = 'hub';
    state.message = undefined;
    render();
  });
  document.querySelector('#playBtn')?.addEventListener('click', play);
  document.querySelector('#howToPlayBtn')?.addEventListener('click', () => {
    state.message = 'Play matches 2-4 travelers. Each day you receive 5 cards, place up to 3 stops, manage Xu and stamina, then score the final itinerary.';
    render();
  });
  document.querySelector('#settingsBtn')?.addEventListener('click', () => {
    state.message = 'Settings are coming soon.';
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-region]').forEach((button) => {
    button.addEventListener('click', () => {
      state.selectedRegion = button.dataset.region ?? 'SAIGON';
      render();
    });
  });
  document.querySelector('#settingsForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const name = document.querySelector<HTMLInputElement>('#displayNameInput')?.value;
    const language = document.querySelector<HTMLSelectElement>('#languageInput')?.value ?? 'English';
    const sound = Boolean(document.querySelector<HTMLInputElement>('#soundInput')?.checked);
    updateAccountName(name);
    state.language = language;
    state.soundEnabled = sound;
    localStorage.setItem('lkbc.language', language);
    localStorage.setItem('lkbc.sound', sound ? 'on' : 'off');
    state.message = 'Settings saved.';
    state.screen = 'settings';
    render();
  });
  document.querySelector('#resetLocalDataBtn')?.addEventListener('click', () => {
    void logoutAccount();
    localStorage.removeItem('lkbc.language');
    localStorage.removeItem('lkbc.sound');
  });
  document.querySelector('#playAgainBtn')?.addEventListener('click', () => {
    state.screen = 'hub';
    state.snapshot = undefined;
    state.player = createPlayer();
    state.savedResultIds = [];
    state.message = undefined;
    render();
  });
  document.querySelector('#exportPdfBtn')?.addEventListener('click', () => {
    state.message = 'A royal PDF seal export will be forged in the next build.';
    render();
  });
  document.querySelector('#backToHubBtn')?.addEventListener('click', () => {
    state.screen = 'hub';
    state.snapshot = undefined;
    state.message = undefined;
    state.statusText = 'Ready';
    render();
  });
  document.querySelector('#skipBtn')?.addEventListener('click', skipSelectedSlot);
  document.querySelector('#endPlanningBtn')?.addEventListener('click', endPlanning);
  document.querySelectorAll<HTMLButtonElement>('[data-card-id]').forEach((button) => {
    button.addEventListener('click', () => openCard(button.dataset.cardId));
  });
  document.querySelectorAll<HTMLElement>('[data-cell-id]').forEach((cell) => {
    cell.addEventListener('dragover', (event) => event.preventDefault());
    cell.addEventListener('dragenter', () => {
      if (!canPlan()) return;
      state.dragOverSlotId = cell.dataset.cellId;
      render();
    });
    cell.addEventListener('dragleave', () => {
      if (state.dragOverSlotId === cell.dataset.cellId) {
        state.dragOverSlotId = undefined;
        render();
      }
    });
    cell.addEventListener('drop', (event) => {
      event.preventDefault();
      if (!canPlan()) return;
      state.selectedSlot = parseCell(cell.dataset.cellId ?? '');
      const cardId = event.dataTransfer?.getData('text/card-id');
      if (cardId) openCard(cardId);
      state.draggingCardId = undefined;
      state.dragOverSlotId = undefined;
      render();
    });
    cell.addEventListener('click', () => {
      if (!canPlan()) return;
      state.selectedSlot = parseCell(cell.dataset.cellId ?? '');
      render();
    });
  });
}

function play() {
  if (!isSignedIn()) {
    state.screen = 'login';
    state.message = 'Sign in with your email and password before matchmaking.';
    render();
    return;
  }
  state.screen = 'matching';
  state.statusText = 'Finding players...';
  state.message = undefined;
  if (!multiplayer.isConnected()) multiplayer.connect();
  multiplayer.findMatch(playerId, playerName());
  render();
}

function boardMarkup() {
  return `
    <div class="board-label">Time</div>
    ${DAYS.map((day) => `<div class="board-label">Day ${day}</div>`).join('')}
    ${TIME_SLOTS.map((slot) => `
      <div class="time-label">${labelSlot(slot)}</div>
      ${DAYS.map((day) => renderCell({ day, slot })).join('')}
    `).join('')}
  `;
}

function scoreMarkup() {
  const score = calculateScore(state.player.board, cards, state.player.resources);
  return `
    <div class="score-grid">
      ${hudCard('Route', `${score.routeKm}km`)}
      ${hudCard('Bonus', `+${score.comboVp}`)}
      ${hudCard('Penalty', `-${score.penaltyVp}`)}
      ${hudCard('Total', score.totalVp)}
    </div>
    <div class="meter"><span style="width:${Math.min(100, Math.max(5, score.totalVp * 4))}%"></span></div>
    ${
      score.warnings.length
        ? `<div class="warning-list">${score.warnings.slice(0, 3).map((warning) => `<span>${warning}</span>`).join('')}</div>`
        : '<p class="helper">No route warnings yet.</p>'
    }
  `;
}

function renderCardModal() {
  const root = document.querySelector('#modalRoot')!;
  const card = cards.find((item) => item.card_id === state.previewCardId);
  if (!card) {
    root.innerHTML = '';
    return;
  }

  root.innerHTML = `
    <div class="modal-backdrop">
      <article class="card-modal">
        <button class="modal-close" id="closeModalBtn">Close</button>
        <div class="card-modal-layout">
          <div class="modal-card-stage">
            ${tacticalCardMarkup(card, { variant: 'modal' })}
          </div>
          <aside class="card-modal-actions-panel">
            <p class="eyebrow">Expedition order</p>
            <h2>${card.name}</h2>
            <p class="modal-lore">${card.description ?? 'A tactical travel stop for your itinerary.'}</p>
            <div class="modal-stat-grid">
              ${hudCard('Xu', card.cost)}
              ${hudCard('Stamina', card.stamina)}
              ${hudCard('VP', card.victory_point)}
            </div>
            <p class="selected-slot">Slot: ${state.selectedSlot ? `Day ${state.selectedSlot.day} / ${labelSlot(state.selectedSlot.slot)}` : 'Choose a board slot'}</p>
            <p class="helper">Drag this card onto a glowing slot, or tap a slot on the board, then press Place.</p>
            <div class="modal-actions">
              <button id="placeCardBtn" class="primary-action">Place</button>
              <button id="skipFromModalBtn" class="quiet-action">Skip</button>
              <button id="closeModalBtn2" class="quiet-action">Close</button>
            </div>
          </aside>
        </div>
      </article>
    </div>
  `;

  root.querySelector('#placeCardBtn')?.addEventListener('click', () => placePreviewCard());
  root.querySelector('#skipFromModalBtn')?.addEventListener('click', skipSelectedSlot);
  root.querySelector('#closeModalBtn')?.addEventListener('click', closeModal);
  root.querySelector('#closeModalBtn2')?.addEventListener('click', closeModal);
}

function renderDraftOverlay() {
  const root = document.querySelector('#modalRoot')!;
  if (state.previewCardId) return;
  if (state.screen !== 'game' || state.snapshot?.phase !== 'draft' || currentPlayerReady() || state.player.hand.length === 0) return;

  const preview = cards.find((card) => card.card_id === state.draftPreviewCardId) ?? cards.find((card) => card.card_id === state.player.hand[0]);
  if (!preview) return;
  const pickNumber = Math.min((state.snapshot?.pickIndex ?? 0) + 1, 3);

  root.innerHTML = `
    <div class="modal-backdrop draft-backdrop">
      <section class="draft-choice">
        <div class="draft-choice-header">
          <div>
            <p class="eyebrow">Draft hand</p>
            <h2>Pick ${pickNumber}/3</h2>
            <p>Choose one card to store for planning, or discard one to rest. Rest creates an empty travel buffer for this time slot.</p>
          </div>
          <div class="draft-actions">
            <button id="storeDraftBtn" class="primary-action">Choose to Storage</button>
            <button id="discardDraftBtn" class="quiet-action">Discard for Rest</button>
          </div>
        </div>
        <div class="draft-choice-layout">
          <div class="draft-choice-grid">
            ${state.player.hand.map((cardId) => draftCardButton(cardId, preview.card_id)).join('')}
          </div>
        </div>
      </section>
    </div>
  `;

  root.querySelector('#storeDraftBtn')?.addEventListener('click', () => storeDraftCard(preview.card_id));
  root.querySelector('#discardDraftBtn')?.addEventListener('click', () => discardDraftCard(preview.card_id));
  root.querySelectorAll<HTMLButtonElement>('[data-draft-card-id]').forEach((button) => {
    button.addEventListener('click', () => {
      state.draftPreviewCardId = button.dataset.draftCardId;
      render();
    });
  });
}

function placePreviewCard() {
  if (!state.previewCardId) return;
  if (!state.selectedSlot) {
    state.message = 'Choose a slot first.';
    render();
    return;
  }
  placeCard(state.previewCardId, state.selectedSlot);
}

function placeCard(cardId: string, position: GridPosition) {
  const card = cards.find((item) => item.card_id === cardId);
  if (!card || currentPlayerReady() || !canPlan()) return;

  const placement = validateGridPlacement(state.player.board, position, state.snapshot?.day ?? 1);
  const usage = validateCardUsage(state.player, card);
  if (!placement.ok || !usage.ok) {
    state.message = placement.reason ?? usage.reason ?? 'That move is not available.';
    render();
    return;
  }

  if (multiplayer.isConnected() && state.snapshot) {
    multiplayer.placeCard(state.snapshot.roomId, playerId, cardId, position);
  } else {
    state.player.board = placeCardOnBoard(state.player.board, cardId, position);
    state.player.resources = applyOnPlayEffects(state.player.resources, card);
    state.player.storage = state.player.storage.filter((id) => id !== cardId);
    state.player.ready = true;
  }

  state.previewCardId = undefined;
  state.selectedCardId = undefined;
  render();
}

function storeDraftCard(cardId: string) {
  if (!state.player.hand.includes(cardId)) return;
  const card = cards.find((item) => item.card_id === cardId);
  if (!card) return;

  if (multiplayer.isConnected() && state.snapshot) {
    multiplayer.pickCard(state.snapshot.roomId, playerId, cardId);
  } else {
    const payment = payDraftCost(state.player.resources, card);
    state.player.hand = state.player.hand.filter((id) => id !== cardId);
    state.player.storage = [...state.player.storage, cardId];
    state.player.resources = payment.resources;
    state.player.ready = true;
  }
  state.draftPreviewCardId = undefined;
  render();
}

function discardDraftCard(cardId: string) {
  if (!state.player.hand.includes(cardId)) return;

  if (multiplayer.isConnected() && state.snapshot) {
    multiplayer.discardDraftCard(state.snapshot.roomId, playerId, cardId);
  } else {
    const slot = TIME_SLOTS[Math.min(state.snapshot?.pickIndex ?? 0, TIME_SLOTS.length - 1)];
    state.player.board = skipBoardSlot(state.player.board, { day: state.snapshot?.day ?? 1, slot });
    state.player.hand = state.player.hand.filter((id) => id !== cardId);
    state.player.resources = gainRestResources(state.player.resources);
    state.player.ready = true;
  }
  state.draftPreviewCardId = undefined;
  render();
}

function skipSelectedSlot() {
  if (currentPlayerReady() || !canPlan()) return;
  const target = state.selectedSlot ?? state.player.board.find((cell) => cell.day === (state.snapshot?.day ?? 1) && !cell.card_id && !cell.skipped);
  if (!target) return;

  if (multiplayer.isConnected() && state.snapshot) {
    multiplayer.skipSlot(state.snapshot.roomId, playerId, target);
  } else {
    state.player.board = skipBoardSlot(state.player.board, target);
    state.player.ready = true;
  }
  state.previewCardId = undefined;
  render();
}

function endPlanning() {
  if (currentPlayerReady() || state.snapshot?.phase !== 'placement') return;
  const openSlot = state.player.board.find(
    (cell) => cell.day === (state.snapshot?.day ?? 1) && !cell.card_id && !cell.skipped && !cell.locked,
  );
  if (openSlot) {
    state.message = 'Fill or rest every slot before locking the day.';
    render();
    return;
  }

  if (multiplayer.isConnected() && state.snapshot) {
    multiplayer.endPlanning(state.snapshot.roomId, playerId);
  } else {
    state.player.ready = true;
  }
  render();
}

function openCard(cardId?: string) {
  if (!cardId || currentPlayerReady() || !canPlan()) return;
  state.previewCardId = cardId;
  state.selectedCardId = cardId;
  render();
}

function closeModal() {
  state.previewCardId = undefined;
  render();
}

function renderCell(position: GridPosition) {
  const cell = state.player.board.find((item) => item.day === position.day && item.slot === position.slot);
  const card = cards.find((item) => item.card_id === cell?.card_id);
  const currentDay = state.snapshot?.day ?? 1;
  const active = position.day === currentDay ? ' active' : '';
  const selected = state.selectedSlot?.day === position.day && state.selectedSlot.slot === position.slot ? ' selected-slot-cell' : '';
  const locked = cell?.locked ? ' locked-cell' : '';
  const valid = state.draggingCardId && canPlan() && !cell?.card_id && !cell?.skipped && !cell?.locked && position.day === currentDay ? ' valid-drop-cell' : '';
  const over = state.dragOverSlotId === cellId(position) ? ' drag-over-cell' : '';
  return `
    <div class="cell${active}${selected}${valid}${over}${locked}" data-cell-id="${cellId(position)}">
      ${
        card
          ? `<strong>${card.name}</strong><small>${card.cost} Xu - ${card.victory_point} VP</small>`
          : cell?.locked
            ? '<span>Locked</span><small>Exhausted</small>'
            : cell?.skipped
              ? '<span>Rest / Travel buffer</span>'
              : '<span>Choose slot</span>'
      }
    </div>
  `;
}

function cardButton(cardId: string) {
  const card = cards.find((item) => item.card_id === cardId);
  if (!card) return '';
  const selected = state.selectedCardId === card.card_id ? ' selected' : '';
  const dragging = state.draggingCardId === card.card_id ? ' dragging' : '';
  return `
    <button class="travel-card tactical-card-button${selected}${dragging}" draggable="${canPlan()}" data-card-id="${card.card_id}">
      ${tacticalCardMarkup(card, { variant: 'storage' })}
    </button>
  `;
}

function playerRow(player: PlayerState) {
  const self = player.playerId === playerId ? ' self' : '';
  return `
    <article class="player-row${self}">
      <strong>${player.name}</strong>
      <span>${player.ready ? 'Ready' : 'Choosing'}</span>
    </article>
  `;
}

function currentPlayerReady() {
  return Boolean(state.snapshot?.players.find((player) => player.playerId === playerId)?.ready ?? state.player.ready);
}

function canPlan() {
  return state.screen === 'game' && state.snapshot?.phase === 'placement' && !currentPlayerReady();
}

function phaseLabel(phase: string) {
  if (phase === 'draft') return 'Draft Cards';
  if (phase === 'placement') return 'Plan Itinerary';
  if (phase === 'scoring') return 'Resolve Events';
  return 'Your turn';
}

function phaseTracker(phase: string, finished = false) {
  const steps = [
    { id: 'draft', label: 'Draft Cards' },
    { id: 'placement', label: 'Plan Itinerary' },
    { id: 'scoring', label: 'Simulate Trip' },
    { id: 'events', label: 'Resolve Events' },
    { id: 'finished', label: 'Trip Complete' },
  ];
  const activeIndex = finished ? steps.length - 1 : Math.max(0, steps.findIndex((step) => step.id === phase));

  return `
    <section class="phase-tracker" aria-label="Expedition progress">
      ${steps.map((step, index) => `
        <article class="${index < activeIndex ? 'complete' : ''} ${index === activeIndex ? 'active' : ''}">
          <span>${index + 1}</span>
          <strong>${step.label}</strong>
        </article>
      `).join('')}
    </section>
  `;
}

function hudCard(label: string, value: string | number) {
  return `<article class="hud-card hud-${slugify(label)}"><span>${label}</span><strong>${value}</strong></article>`;
}

function ambientScene() {
  return `
    <div class="fantasy-ambient" aria-hidden="true">
      <span class="torch torch-left"></span>
      <span class="torch torch-right"></span>
      <span class="fog-ribbon fog-one"></span>
      <span class="fog-ribbon fog-two"></span>
    </div>
  `;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function parseCell(id: string): GridPosition {
  const [, day, slot] = id.match(/^day-(\d+)-(.+)$/) ?? [];
  return { day: Number(day), slot: slot as GridPosition['slot'] };
}

function createPlayer(): PlayerState {
  return {
    playerId,
    name: playerName(),
    board: createBoard(),
    hand: [],
    chosen: [],
    storage: [],
    draftChoice: undefined,
    resources: { ...STARTING_RESOURCES },
    ready: false,
  };
}

async function hydrateCloudProfile() {
  if (state.cloudLoaded.profile) return;
  state.cloudLoaded.profile = true;
  if (!isFirebaseConfigured()) return;

  try {
    const user = currentCloudUser();
    if (!user) return;

    playerId = user.uid;
    const profile = await loadCloudProfile(playerId);
    if (!profile?.name) return;

    persistAccountProfile(profile.playerId, profile.name);
    state.screen = 'hub';
    render();
  } catch {
    state.message = 'Cloud profile is unavailable right now.';
    render();
  }
}

async function signInAccount(email: string, password: string) {
  if (!isFirebaseConfigured()) {
    state.message = 'Firebase config is required before signing in.';
    render();
    return;
  }

  try {
    const profile = await loginWithEmail(email.trim(), password);
    persistAccountProfile(profile.playerId, profile.name);
    state.screen = 'hub';
    state.message = undefined;
    state.authMode = 'signin';
    state.cloudLoaded = { profile: true, rankings: false, history: false };
    render();
  } catch (error) {
    state.message = authErrorMessage(error, 'Could not sign in.');
    render();
  }
}

async function registerAccount(name: string, email: string, password: string) {
  if (!isFirebaseConfigured()) {
    state.message = 'Firebase config is required before registering.';
    render();
    return;
  }

  const displayName = name.trim();
  if (!displayName) {
    state.message = 'Enter an adventurer name.';
    render();
    return;
  }

  try {
    const profile = await registerWithEmail(email.trim(), password, displayName);
    persistAccountProfile(profile.playerId, profile.name);
    state.screen = 'hub';
    state.message = undefined;
    state.authMode = 'signin';
    state.cloudLoaded = { profile: true, rankings: false, history: false };
    render();
  } catch (error) {
    state.message = authErrorMessage(error, 'Could not register.');
    render();
  }
}

function authErrorMessage(error: unknown, fallback: string) {
  const code = typeof error === 'object' && error && 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : '';

  if (code.includes('auth/email-already-in-use')) return 'This email already has an account. Please sign in instead.';
  if (code.includes('auth/api-key-not-valid')) return 'Firebase API key is not valid. Copy the Web app config again into .env, then restart npm run dev.';
  if (code.includes('auth/invalid-email')) return 'Please enter a valid email address.';
  if (code.includes('auth/weak-password')) return 'Password is too weak. Use at least 6 characters.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'Email or password is incorrect.';
  if (code.includes('auth/user-not-found')) return 'No account was found for this email.';
  if (code.includes('auth/network-request-failed')) return 'Network error. Please check your connection and try again.';
  if (code.includes('permission-denied') || message.toLowerCase().includes('permission')) {
    return 'Account was accepted, but cloud profile save was blocked by Firestore rules. Check FIREBASE_SETUP.md rules.';
  }
  if (message) return `${fallback} ${message}`;

  return fallback;
}

function updateAccountName(name?: string) {
  const displayName = name?.trim() || playerName();
  persistAccountProfile(playerId, displayName);
  void saveCloudProfile({ playerId, name: displayName, mode: 'password' }).catch(() => {
    state.message = 'Settings saved locally. Cloud profile update failed.';
    render();
  });
}

async function logoutAccount() {
  await logoutCloudUser().catch(() => undefined);
  localStorage.removeItem(profileKey());
  playerId = getOrCreatePlayerId();
  state.screen = 'login';
  state.message = 'Signed out.';
  state.authMode = 'signin';
  state.snapshot = undefined;
  state.cloudRankings = undefined;
  state.cloudHistory = undefined;
  state.cloudLoaded = { profile: false, rankings: false, history: false };
  state.player = createPlayer();
  render();
}

function persistAccountProfile(nextPlayerId: string, name: string) {
  playerId = nextPlayerId;
  localStorage.setItem(profileKey(), JSON.stringify({ playerId, name, mode: 'password' }));
  state.player = { ...createPlayer(), ...state.player, playerId, name };
}

async function hydrateCloudRankings() {
  if (state.cloudLoaded.rankings) return;
  state.cloudLoaded.rankings = true;
  if (!isFirebaseConfigured()) return;

  try {
    const rankings = await loadCloudRankings();
    if (rankings.length) {
      state.cloudRankings = rankings;
      render();
    }
  } catch {
    state.message = 'Cloud rankings are unavailable right now.';
    render();
  }
}

async function hydrateCloudHistory() {
  if (state.cloudLoaded.history) return;
  state.cloudLoaded.history = true;
  if (!isFirebaseConfigured()) return;

  try {
    const history = await loadCloudHistory(playerId);
    state.cloudHistory = history.length ? history : readLocalHistory();
    render();
  } catch {
    state.cloudHistory = readLocalHistory();
    state.message = 'Cloud history is unavailable right now. Showing saved local results.';
    render();
  }
}

async function persistFinishedMatch() {
  const snapshot = state.snapshot;
  if (!snapshot || snapshot.phase !== 'finished' || !isFirebaseConfigured()) return;

  const resultId = `${snapshot.roomId}-${playerId}`;
  if (state.savedResultIds.includes(resultId)) return;
  state.savedResultIds = [...state.savedResultIds, resultId];

  const player = snapshot.players.find((item) => item.playerId === playerId) ?? state.player;
  const score = calculateScore(player.board, cards, player.resources);
  const timeline = boardToTimeline(player.board, cards);
  const won = snapshot.winnerId === playerId;
  const today = new Date().toISOString().slice(0, 10);
  const history: CloudHistory = {
    id: resultId,
    date: today,
    destination: won ? `${player.name}'s winning expedition` : `${player.name}'s expedition`,
    finalVp: score.totalVp,
    itinerary: timeline.map((entry) => entry.title).join(' -> ') || 'No itinerary created.',
    timeline: timeline.map((entry) => ({
      day: entry.day,
      slot: entry.slot,
      title: entry.title,
      note: entry.note,
      estimatedCost: entry.estimatedCost,
    })),
    winnerName: snapshot.players.find((item) => item.playerId === snapshot.winnerId)?.name,
    resultLabel: won ? 'Winner' : 'Completed',
  };
  const ranking: CloudRanking = {
    name: player.name,
    totalWins: won ? 1 : 0,
    highestVp: score.totalVp,
    recent: won ? `Won with ${score.totalVp} VP` : `Finished with ${score.totalVp} VP`,
  };

  try {
    saveLocalHistory(history);
    await saveCloudMatchResult(playerId, history, ranking);
    state.cloudLoaded.history = false;
    state.cloudLoaded.rankings = false;
  } catch {
    saveLocalHistory(history);
    state.message = 'Match result stayed local. Cloud history will retry after Firebase is available.';
    render();
  }
}

function profileKey() {
  return `lkbc.profile.${playerId}`;
}

function isSignedIn() {
  return Boolean(currentCloudUser() && readGuestName());
}

function readGuestName() {
  const raw = localStorage.getItem(profileKey());
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { name?: string };
    return parsed.name;
  } catch {
    return undefined;
  }
}

function localHistoryKey() {
  return `lkbc.history.${playerId}`;
}

function readLocalHistory() {
  const raw = localStorage.getItem(localHistoryKey());
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as CloudHistory[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalHistory(entry: CloudHistory) {
  const current = readLocalHistory().filter((item) => item.id !== entry.id);
  localStorage.setItem(localHistoryKey(), JSON.stringify([entry, ...current].slice(0, 20)));
  state.cloudHistory = [entry, ...(state.cloudHistory ?? current).filter((item) => item.id !== entry.id)].slice(0, 20);
}

function cloudStatusNote() {
  if (!isFirebaseConfigured()) {
    return '<p class="helper">Cloud save is ready. Add Firebase keys in .env to sync this screen across devices.</p>';
  }

  return '<p class="helper">Cloud save is enabled for player data.</p>';
}

function draftCardButton(cardId: string, selectedCardId: string) {
  const card = cards.find((item) => item.card_id === cardId);
  if (!card) return '';
  const selected = selectedCardId === card.card_id ? ' selected' : '';
  return `
    <button class="draft-mini-card${selected}" data-draft-card-id="${card.card_id}">
      ${tacticalCardMarkup(card, { variant: 'draft' })}
    </button>
  `;
}

function tacticalCardMarkup(card: TravelCard, options: { variant: 'draft' | 'storage' | 'modal' }) {
  const compact = options.variant === 'storage';
  const location = card.phase_pool ? card.phase_pool.replace(/_/g, ' ') : 'TRAVEL';
  return `
    <article class="tactical-card tactical-card-${options.variant}">
      <header class="tactical-card-header">
        <strong>${card.name}</strong>
        <span class="rarity-pill">${cardStars(card.victory_point)}</span>
        <span class="vp-pill">${card.victory_point}</span>
      </header>
      <div class="tactical-card-art">
        <span class="art-icon">MAP</span>
      </div>
      <div class="location-chip">${location}</div>
      <p class="flavor-text">${card.description ?? 'A tactical travel stop for your itinerary.'}</p>
      ${compact ? '' : `<p class="effect-box">${card.on_play_effect}</p>`}
      <footer class="tactical-card-costs">
        <span><small>Xu</small><strong>${card.cost}</strong></span>
        <span><small>Stamina</small><strong>${card.stamina}</strong></span>
      </footer>
    </article>
  `;
}

function cardStars(vp: number) {
  if (vp >= 35) return '***';
  if (vp >= 15) return '**';
  return '*';
}

function getOrCreatePlayerId() {
  const tabKey = sessionStorage.getItem('lkbc.tabKey') ?? `tab-${Math.random().toString(16).slice(2, 8)}`;
  sessionStorage.setItem('lkbc.tabKey', tabKey);

  const storageKey = `lkbc.playerId.${tabKey}`;
  const existing = localStorage.getItem(storageKey);
  if (existing) return existing;

  const next = `player-${Math.random().toString(16).slice(2, 8)}`;
  localStorage.setItem(storageKey, next);
  return next;
}

function playerName() {
  return readGuestName() ?? `Traveler ${playerId.slice(-4).toUpperCase()}`;
}

function mockRankings() {
  return [
    { name: playerName(), totalWins: 2, highestVp: 126, recent: 'Won Saigon route' },
    { name: 'Mai Explorer', totalWins: 4, highestVp: 148, recent: 'Lost by distance penalty' },
    { name: 'Khanh Combo', totalWins: 3, highestVp: 139, recent: 'Won culture chain' },
    { name: 'An Local', totalWins: 1, highestVp: 104, recent: 'Finished second' },
  ];
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function labelSlot(slot: string) {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

function handleDragStart(event: DragEvent) {
  if (!canPlan()) return;
  const target = (event.target as HTMLElement).closest<HTMLElement>('[data-card-id]');
  const cardId = target?.dataset.cardId;
  if (!cardId) return;
  state.draggingCardId = cardId;
  state.selectedCardId = cardId;
  event.dataTransfer?.setData('text/card-id', cardId);
  event.dataTransfer?.setDragImage(target, 24, 24);
  render();
}

function handleDragEnd() {
  state.draggingCardId = undefined;
  state.dragOverSlotId = undefined;
  render();
}

function handleHiddenShortcuts(event: KeyboardEvent) {
  if (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'r') {
    event.preventDefault();
    if (multiplayer.isConnected()) multiplayer.resetMatchmaking();
    state.screen = 'hub';
    state.snapshot = undefined;
    state.player = createPlayer();
    state.message = 'Matchmaking reset.';
    render();
  }
}
