import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLibraryState } from '../src/hooks/useUserLibrary.ts';

test('migrates v1 drafts as manual prompts without losing content',()=>{const state=normalizeLibraryState({favorites:['a'],recent:[],drafts:[{id:'d1',templateId:'remote-template',templateName:'T',coverImage:'/x.png',values:{subject:'x'},prompt:'hand edited',updatedAt:'2026-01-01T00:00:00.000Z'}]});assert.equal(state.drafts[0].version,2);assert.equal(state.drafts[0].promptMode,'manual');assert.equal(state.drafts[0].manualPrompt,'hand edited')});
