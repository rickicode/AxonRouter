/**
 * Shuffle Deck Utility
 * 
 * Implements Fisher-Yates shuffle and deck-based selection
 * for strict-random combo strategy.
 */

/**
 * Fisher-Yates shuffle algorithm
 * @param {Array} array - Array to shuffle
 * @returns {Array} New shuffled array
 */
export function fisherYatesShuffle(array) {
  if (!Array.isArray(array)) return [];
  const result = [...array];
  
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  
  return result;
}

// In-memory deck state for strict-random
const deckState = new Map();

/**
 * Get next item from a deck, reshuffling when exhausted
 * @param {string} deckKey - Unique key for this deck
 * @param {Array} items - Items in the deck
 * @returns {string|null} Next item from the deck
 */
export async function getNextFromDeck(deckKey, items) {
  if (!Array.isArray(items) || items.length === 0) return null;
  
  let deck = deckState.get(deckKey);
  
  // Reshuffle if deck is empty or items changed
  if (!deck || deck.items.length === 0 || !arraysEqual(deck.items, items)) {
    const shuffled = fisherYatesShuffle(items);
    deck = { items: [...items], current: shuffled, original: [...items] };
    deckState.set(deckKey, deck);
  }
  
  // Get next item
  if (deck.current.length === 0) {
    // Reshuffle
    deck.current = fisherYatesShuffle([...deck.items]);
    deckState.set(deckKey, deck);
  }
  
  return deck.current.shift();
}

function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Reset a specific deck
 * @param {string} deckKey - Deck key to reset
 */
export function resetDeck(deckKey) {
  deckState.delete(deckKey);
}

/**
 * Reset all decks
 */
export function resetAllDecks() {
  deckState.clear();
}
