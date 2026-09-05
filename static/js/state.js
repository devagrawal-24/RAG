// Reactive Pub/Sub State Store

class StateStore {
  constructor() {
    this._state = {
      projects: [],
      currentProject: null,
      activeTab: 'tabPapers',
      papers: [],
      outline: { sections: [], version: 0 },
      summaries: [],
      reviews: [],
      currentReview: null,
      chatMessages: [],
      settings: {}
    };
    this._listeners = new Map();
  }

  getState(key) {
    if (key) return this._state[key];
    return { ...this._state };
  }

  setState(key, value) {
    const prev = this._state[key];
    this._state[key] = value;
    this._emit(key, value, prev);
  }

  update(patch) {
    for (const [key, value] of Object.entries(patch)) {
      this.setState(key, value);
    }
  }

  subscribe(key, callback) {
    if (!this._listeners.has(key)) {
      this._listeners.set(key, new Set());
    }
    this._listeners.get(key).add(callback);

    // Return unsubscribe function
    return () => {
      this._listeners.get(key)?.delete(callback);
    };
  }

  _emit(key, value, prev) {
    if (this._listeners.has(key)) {
      this._listeners.get(key).forEach(cb => {
        try {
          cb(value, prev);
        } catch (err) {
          console.error(`Error in state subscriber for "${key}":`, err);
        }
      });
    }
  }
}

export const store = new StateStore();
