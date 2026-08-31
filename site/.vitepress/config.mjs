import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'pawnbook',
  description: 'Self-hosted chess trainer — play engines, analyse every game, drill your mistakes with spaced repetition.',
  base: '/pawnbook/',
  lang: 'en-US',

  appearance: 'dark',

  ignoreDeadLinks: [/^http:\/\/localhost/],

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/pawnbook/favicon.svg' }],
    ['meta', { name: 'theme-color', content: '#3987e5' }],
  ],

  themeConfig: {
    logo: { svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6zm-1 7a5 5 0 0 0-4.9 4H5a1 1 0 0 0 0 2h1.26l1.2 4H7a1 1 0 0 0 0 2h10a1 1 0 0 0 0-2h-.46l1.2-4H19a1 1 0 0 0 0-2h-1.1A5 5 0 0 0 13 9h-2z"/></svg>' },
    siteTitle: 'pawnbook',

    nav: [
      { text: 'Guide', link: '/guide/what-is-pawnbook', activeMatch: '/guide/' },
      { text: 'Concepts', link: '/concepts/architecture', activeMatch: '/concepts/' },
      { text: 'Reference', link: '/reference/rest-api', activeMatch: '/reference/' },
      { text: 'Research', link: '/research/', activeMatch: '/research/' },
      {
        text: 'GitHub',
        link: 'https://github.com/JohnnyFoulds/pawnbook',
      },
    ],

    sidebar: {
      '/guide/': [
        {
          text: 'Introduction',
          items: [
            { text: 'What is pawnbook?', link: '/guide/what-is-pawnbook' },
          ],
        },
        {
          text: 'Getting Started',
          items: [
            { text: 'Installation', link: '/guide/installation' },
            { text: 'Quickstart', link: '/guide/quickstart' },
            { text: 'Configuration', link: '/guide/configuration' },
          ],
        },
        {
          text: 'Using pawnbook',
          items: [
            { text: 'Playing Games', link: '/guide/playing' },
            { text: 'Post-game Analysis', link: '/guide/analysis' },
            { text: 'The Drill System', link: '/guide/drilling' },
            { text: 'The Repertoire Coach', link: '/guide/repertoire' },
            { text: 'Terminal UI', link: '/guide/tui' },
          ],
        },
      ],

      '/concepts/': [
        {
          text: 'Concepts',
          items: [
            { text: 'Architecture', link: '/concepts/architecture' },
            { text: 'Analysis Pipeline', link: '/concepts/analysis-pipeline' },
            { text: 'Move Grading', link: '/concepts/move-grading' },
            { text: 'Elo & Strength Estimation', link: '/concepts/elo-strength' },
            { text: 'FSRS Scheduling', link: '/concepts/fsrs' },
            { text: 'Repertoire System', link: '/concepts/repertoire-system' },
          ],
        },
      ],

      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'REST API', link: '/reference/rest-api' },
            { text: 'WebSocket API', link: '/reference/websocket-api' },
            { text: 'Configuration', link: '/reference/configuration' },
            { text: 'Balance Parameters', link: '/reference/balance' },
          ],
        },
      ],

      '/research/': [
        {
          text: 'Research',
          items: [
            { text: 'Overview', link: '/research/' },
            { text: 'Strength Estimation', link: '/research/strength-estimation' },
            { text: 'Methodology & Design', link: '/research/methodology' },
            { text: 'Preregistration', link: '/research/preregistration' },
            { text: 'Chess Feedback Without an LLM', link: '/research/chess-feedback' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/JohnnyFoulds/pawnbook' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'pawnbook — self-hosted chess training',
    },

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/JohnnyFoulds/pawnbook/edit/master/site/:path',
      text: 'Edit this page on GitHub',
    },
  },
})
