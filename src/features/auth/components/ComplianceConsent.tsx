import { Anchor, Checkbox, Modal, Text } from '@mantine/core';
import ReactMarkdown from 'react-markdown';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';

import type { ComplianceDocuments } from '@/api/types';

interface ComplianceConsentProps {
  documents: ComplianceDocuments;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string | null;
  disabled?: boolean;
}

export function ComplianceConsent({
  documents,
  checked,
  onChange,
  error,
  disabled,
}: ComplianceConsentProps) {
  const { t } = useTranslation();
  const [active, setActive] = useState<{ title: string; content: string } | null>(null);
  const openDocument = (event: MouseEvent, title: string, content: string) => {
    event.preventDefault();
    setActive({ title, content });
  };

  return (
    <>
      <Checkbox
        checked={checked}
        onChange={(event) => onChange(event.currentTarget.checked)}
        disabled={disabled}
        label={
          <>
            {t('compliance.consentPrefix')}{' '}
            <Anchor
              inherit
              component="button"
              type="button"
              onClick={(event) =>
                openDocument(event, t('compliance.terms'), documents.terms_markdown)
              }
            >
              {t('compliance.terms')}
            </Anchor>
            {t('compliance.and')}
            <Anchor
              inherit
              component="button"
              type="button"
              onClick={(event) =>
                openDocument(event, t('compliance.privacy'), documents.privacy_markdown)
              }
            >
              {t('compliance.privacy')}
            </Anchor>
            {documents.cross_border_enabled && (
              <>
                {t('compliance.and')}
                <Anchor
                  inherit
                  component="button"
                  type="button"
                  onClick={(event) =>
                    openDocument(
                      event,
                      t('compliance.crossBorder'),
                      documents.cross_border_markdown,
                    )
                  }
                >
                  {t('compliance.crossBorder')}
                </Anchor>
              </>
            )}
          </>
        }
      />
      {error && (
        <Text size="sm" c="red">
          {error}
        </Text>
      )}
      <Modal
        opened={active !== null}
        onClose={() => setActive(null)}
        title={active?.title}
        size="lg"
        centered
      >
        {active && (
          <div className="compliance-markdown" style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <ReactMarkdown>{active.content}</ReactMarkdown>
          </div>
        )}
      </Modal>
    </>
  );
}
