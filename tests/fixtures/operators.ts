import type { OperatorRecord } from '../../src/data/types.js';

export const operators: OperatorRecord[] = [
  {
    id: 'prts:147',
    name: '铃兰',
    avatarUrl: 'https://example.test/147.png',
    nameSearch: {
      primaryPinyin: 'linglan',
      alternatePinyin: [],
      primaryInitials: 'll',
      alternateInitials: [],
    },
    aliases: [],
  },
  {
    id: 'prts:268',
    name: '重岳',
    avatarUrl: 'https://example.test/268.png',
    nameSearch: {
      primaryPinyin: 'chongyue',
      alternatePinyin: ['zhongyue'],
      primaryInitials: 'cy',
      alternateInitials: ['zy'],
    },
    aliases: [],
  },
  {
    id: 'prts:352',
    name: '忍冬',
    avatarUrl: 'https://example.test/352.png',
    nameSearch: {
      primaryPinyin: 'rendong',
      alternatePinyin: [],
      primaryInitials: 'rd',
      alternateInitials: [],
    },
    aliases: [
      {
        text: '铃兰妈',
        primaryPinyin: 'linglanma',
        alternatePinyin: [],
        primaryInitials: 'llm',
        alternateInitials: [],
      },
    ],
  },
  {
    id: 'prts:900',
    name: '合成干员',
    avatarUrl: 'https://example.test/900.png',
    nameSearch: {
      primaryPinyin: 'hechengganyuan',
      alternatePinyin: [],
      primaryInitials: 'hcgy',
      alternateInitials: [],
    },
    aliases: [
      {
        text: '别名首字母',
        primaryPinyin: 'biemingshouzimu',
        alternatePinyin: [],
        primaryInitials: 'll',
        alternateInitials: [],
      },
    ],
  },
  {
    id: 'prts:9',
    name: '数值九',
    avatarUrl: 'https://example.test/9.png',
    nameSearch: {
      primaryPinyin: 'samequality',
      alternatePinyin: [],
      primaryInitials: 'szj',
      alternateInitials: [],
    },
    aliases: [],
  },
  {
    id: 'prts:10',
    name: '数值十',
    avatarUrl: 'https://example.test/10.png',
    nameSearch: {
      primaryPinyin: 'samequality',
      alternatePinyin: [],
      primaryInitials: 'szs',
      alternateInitials: [],
    },
    aliases: [],
  },
];
