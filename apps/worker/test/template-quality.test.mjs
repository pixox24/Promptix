import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectTemplateQuality } from '../dist/template-quality.js';

test('detects overlapping defaults and duplicated token context', () => {
  const issues = inspectTemplateQuality({
    name:'滑板人像',summary:'测试',description:'测试模板',category:'portrait',tags:[],scenarios:[],
    variables:[
      {id:'v1',key:'subject',label:'主体',type:'text',defaultValue:'一位穿白色T恤的女性'},
      {id:'v2',key:'clothing',label:'服装',type:'text',defaultValue:'白色T恤'},
      {id:'v3',key:'action',label:'动作',type:'text',defaultValue:'手持滑板站立'},
    ],
    promptTemplate:'{{subject}}，身穿{{clothing}}，手持{{action}}',
  });
  assert.equal(issues.some(issue => issue.code === 'OVERLAPPING_DEFAULT_VALUES'), true);
  assert.equal(issues.some(issue => issue.code === 'DUPLICATE_TOKEN_CONTEXT' && issue.variableKeys.includes('action')), true);
});

test('detects a strict option duplicated in fixed prompt text', () => {
  const issues = inspectTemplateQuality({
    name:'场景',summary:'测试',description:'测试模板',category:'portrait',tags:[],scenarios:[],
    variables:[{id:'v1',key:'background',label:'背景',type:'select',defaultValue:'棕榈树公园',options:['棕榈树公园','海边沙滩']}],
    promptTemplate:'人物位于{{background}}，远处仍然是棕榈树公园',
  });
  assert.equal(issues.some(issue => issue.code === 'SELECT_FIXED_TEXT_CONFLICT'), true);
});
