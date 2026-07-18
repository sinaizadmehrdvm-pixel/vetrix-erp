import react from '@vitejs/plugin-react';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const server = await createServer({
  configFile: false,
  root: process.cwd(),
  plugins: [react()],
  server: { middlewareMode: true },
});

try {
  const [{ default: StatsCard }, { LanguageContext }, countryProfiles] = await Promise.all([
    server.ssrLoadModule('/src/widgets/StatsCard.jsx'),
    server.ssrLoadModule('/src/localization/languageContext.js'),
    server.ssrLoadModule('/src/localization/countryProfiles.js'),
  ]);

  const { formatCountryMoney, getCountryProfile } = countryProfiles;
  const profile = getCountryProfile('IR');
  const zeroInputs = [null, undefined, '', Number.NaN, 0];
  const expectedFa = '۰ ریال';
  const expectedEn = 'IRR 0';

  function plainText(markup) {
    return markup
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
      .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
      .trim();
  }

  function renderWithLanguage(node, language) {
    return renderToStaticMarkup(React.createElement(
      LanguageContext.Provider,
      { value: { language } },
      node,
    ));
  }

  function DashboardKpiValue({ value, dir }) {
    return React.createElement(
      'article',
      { className: 'dashboard-kpi', dir },
      React.createElement('strong', null, React.createElement('bdi', { dir }, value)),
    );
  }

  const results = [];
  for (const input of zeroInputs) {
    const faValue = formatCountryMoney(input, profile, 'fa');
    const enValue = formatCountryMoney(input, profile, 'en');
    const faStatsText = plainText(renderWithLanguage(React.createElement(StatsCard, {
      title: 'Sales Today', value: faValue, icon: React.createElement('span', null, ''),
    }), 'fa'));
    const enStatsText = plainText(renderWithLanguage(React.createElement(StatsCard, {
      title: 'Sales Today', value: enValue, icon: React.createElement('span', null, ''),
    }), 'en'));
    const faKpiText = plainText(renderToStaticMarkup(React.createElement(DashboardKpiValue, { value: faValue, dir: 'rtl' })));
    const enKpiText = plainText(renderToStaticMarkup(React.createElement(DashboardKpiValue, { value: enValue, dir: 'ltr' })));

    if (!faStatsText.includes(expectedFa) || !faKpiText.includes(expectedFa)) {
      throw new Error(`Persian zero money render failed for ${String(input)}: StatsCard=${faStatsText}; Dashboard=${faKpiText}`);
    }
    if (!enStatsText.includes(expectedEn) || !enKpiText.includes(expectedEn)) {
      throw new Error(`English zero money render failed for ${String(input)}: StatsCard=${enStatsText}; Dashboard=${enKpiText}`);
    }
    if ([faStatsText, faKpiText, enStatsText, enKpiText].some((text) => /[•♦◆]/u.test(text))) {
      throw new Error(`Unexpected bullet/diamond marker rendered for ${String(input)}`);
    }

    results.push({ input: String(input), faStatsText, faKpiText, enStatsText, enKpiText });
  }

  console.table(results);
} finally {
  await server.close();
}
