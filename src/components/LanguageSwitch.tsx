import { ActionIcon, Menu, Tooltip } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';

import { SUPPORTED_LANGUAGES, applyLanguage } from '@/i18n';

export function LanguageSwitch() {
  const { t, i18n } = useTranslation();
  const current = i18n.language;

  return (
    <Menu position="bottom-end" width={160}>
      <Menu.Target>
        <Tooltip label={t('common.language')}>
          <ActionIcon variant="default" size="lg" aria-label={t('common.language')}>
            <IconLanguage size={18} stroke={1.5} />
          </ActionIcon>
        </Tooltip>
      </Menu.Target>
      <Menu.Dropdown>
        {SUPPORTED_LANGUAGES.map((language) => (
          <Menu.Item
            key={language.code}
            onClick={() => applyLanguage(language.code)}
            fw={current === language.code ? 600 : undefined}
          >
            {language.label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
