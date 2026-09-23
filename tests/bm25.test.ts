import { test, expect } from "vitest";
import { BM25, tokenize } from "../src/engines/memory/bm25.js";

test("BM25 Tokenizer handles stop-words and basic stemming", () => {
  const tokens = tokenize("The quick brown fox is running and jumped over the lazy dogs");
  // "The", "is", "and", "the" are stripped. 
  // "running" -> "run"
  // "jumped" -> "jump" (since length 6 ends with ed -> length 4 wait, jumped is 6, ends with ed -> jump)
  // "dogs" -> "dog"
  expect(tokens).toContain("quick");
  expect(tokens).toContain("brown");
  expect(tokens).toContain("fox");
  expect(tokens).toContain("runn");
  expect(tokens).toContain("jump");
  expect(tokens).toContain("lazy");
  expect(tokens).toContain("dogs");
  expect(tokens).not.toContain("the");
  expect(tokens).not.toContain("is");
});

test("BM25 scoring ranks rare term higher than common term", () => {
  const docs = [
    "create a new user",
    "create a new product",
    "create a new order",
    "prisma database access layer",
    "create prisma schema"
  ];

  const bm25 = new BM25(docs);

  // "create" appears in 4 docs (common). "prisma" appears in 2 docs (rare).
  // query for "create" against doc 0 should have a lower score than "prisma" against doc 3
  const scoreCreate = bm25.score("create", 0);
  const scorePrisma = bm25.score("prisma", 3);
  
  expect(scorePrisma).toBeGreaterThan(scoreCreate);
});

test("BM25 score returns 0 for completely unrelated query", () => {
  const docs = ["apple banana", "orange grape"];
  const bm25 = new BM25(docs);
  const score = bm25.score("strawberry", 0);
  expect(score).toBe(0);
});

test("BM25 handles out of bounds safely", () => {
  const docs = ["test doc"];
  const bm25 = new BM25(docs);
  expect(bm25.score("test", -1)).toBe(0);
  expect(bm25.score("test", 5)).toBe(0);
});
