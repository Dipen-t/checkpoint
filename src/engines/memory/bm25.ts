const STOP_WORDS = new Set([
  "i",
  "me",
  "my",
  "myself",
  "we",
  "our",
  "ours",
  "ourselves",
  "you",
  "your",
  "yours",
  "yourself",
  "yourselves",
  "he",
  "him",
  "his",
  "himself",
  "she",
  "her",
  "hers",
  "herself",
  "it",
  "its",
  "itself",
  "they",
  "them",
  "their",
  "theirs",
  "themselves",
  "what",
  "which",
  "who",
  "whom",
  "this",
  "that",
  "these",
  "those",
  "am",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "have",
  "has",
  "had",
  "having",
  "do",
  "does",
  "did",
  "doing",
  "a",
  "an",
  "the",
  "and",
  "but",
  "if",
  "or",
  "because",
  "as",
  "until",
  "while",
  "of",
  "at",
  "by",
  "for",
  "with",
  "about",
  "against",
  "between",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "to",
  "from",
  "up",
  "down",
  "in",
  "out",
  "on",
  "off",
  "over",
  "under",
  "again",
  "further",
  "then",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "no",
  "nor",
  "not",
  "only",
  "own",
  "same",
  "so",
  "than",
  "too",
  "very",
  "s",
  "t",
  "can",
  "will",
  "just",
  "don",
  "should",
  "now",
]);

/**
 * Tokenizes text into an array of lowercase, non-stop-word stems.
 * For this lightweight implementation, stemming is simply stripping 's', 'ing', 'ed' at the end of words > 4 chars.
 */
export function tokenize(text: string): string[] {
  const words = text.toLowerCase().match(/[a-z0-9_]+/g) || [];
  return words
    .filter((w) => !STOP_WORDS.has(w) && w.length > 2)
    .map((w) => {
      // Basic stemming
      if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
      if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
      if (w.length > 4 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
      return w;
    });
}

export class BM25 {
  private k1: number;
  private b: number;

  private documentTokens: string[][] = [];
  private documentLengths: number[] = [];
  private avgdl: number = 0;

  // Maps term to number of documents containing it
  private documentFrequency: Map<string, number> = new Map();
  private idf: Map<string, number> = new Map();
  private numDocs: number = 0;

  constructor(documents: string[], k1 = 1.2, b = 0.75) {
    this.k1 = k1;
    this.b = b;
    this.initialize(documents);
  }

  private initialize(documents: string[]) {
    this.numDocs = documents.length;
    let totalLength = 0;

    for (const doc of documents) {
      const tokens = tokenize(doc);
      this.documentTokens.push(tokens);
      this.documentLengths.push(tokens.length);
      totalLength += tokens.length;

      // Count term frequencies per document for Document Frequency
      const uniqueTokens = new Set(tokens);
      for (const token of uniqueTokens) {
        this.documentFrequency.set(token, (this.documentFrequency.get(token) || 0) + 1);
      }
    }

    this.avgdl = this.numDocs > 0 ? totalLength / this.numDocs : 0;

    // Calculate IDF for each term
    for (const [term, df] of this.documentFrequency.entries()) {
      // Standard BM25 IDF formula with +0.5 smoothing
      const idf = Math.log(1 + (this.numDocs - df + 0.5) / (df + 0.5));
      this.idf.set(term, idf);
    }
  }

  /**
   * Scores a single document against a query
   */
  public score(query: string, docIndex: number): number {
    if (this.numDocs === 0 || docIndex < 0 || docIndex >= this.numDocs) return 0;

    const queryTokens = tokenize(query);
    const docTokens = this.documentTokens[docIndex];
    const dl = this.documentLengths[docIndex];

    // Calculate term frequencies in this document
    const termFreqs = new Map<string, number>();
    for (const token of docTokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    let score = 0;

    for (const term of queryTokens) {
      const tf = termFreqs.get(term) || 0;
      if (tf > 0) {
        const idf = this.idf.get(term) || 0;
        // BM25 term frequency normalization
        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (dl / this.avgdl));
        score += idf * (numerator / denominator);
      }
    }

    return score;
  }
}

// Silent modification
