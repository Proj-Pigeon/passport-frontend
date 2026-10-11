import { Alert, Button, Center, Code, Stack } from '@mantine/core';
import { IconAlertTriangle } from '@tabler/icons-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

function ErrorFallback({ error, onReset }: { error: Error; onReset: () => void }) {
  const { t } = useTranslation();

  return (
    <Center mih="100dvh" p="md">
      <Stack maw={520} w="100%" gap="md">
        <Alert color="red" icon={<IconAlertTriangle />} title={t('errorBoundary.title')}>
          {t('errorBoundary.body')}
        </Alert>
        {import.meta.env.DEV && <Code block>{error.message}</Code>}
        <Button onClick={onReset}>{t('errorBoundary.action')}</Button>
      </Stack>
    </Center>
  );
}

export interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Unhandled UI error', error, info.componentStack);
  }

  private reset = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    const error = this.state.error;
    if (!error) {
      return this.props.children;
    }
    return <ErrorFallback error={error} onReset={this.reset} />;
  }
}
