import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <Center mih="60vh">
      <Stack align="center" gap="sm">
        <Title order={1} fz={64} c="dimmed">
          404
        </Title>
        <Text size="lg">页面不存在</Text>
        <Text c="dimmed" size="sm">
          您访问的地址可能已失效或输入有误。
        </Text>
        <Button component={Link} to="/account" mt="md">
          返回账号首页
        </Button>
      </Stack>
    </Center>
  );
}
