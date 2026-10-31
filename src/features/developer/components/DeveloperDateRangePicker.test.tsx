import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { DeveloperDateRangePicker } from './DeveloperDateRangePicker';

const today = '2026-10-28';

function setup(start = '2026-10-01', end = '2026-10-28') {
  const onChange = vi.fn();
  renderWithProviders(
    <DeveloperDateRangePicker
      today={today}
      value={{ start_date: start, end_date: end }}
      onChange={onChange}
    />,
  );
  return { onChange, user: userEvent.setup() };
}

async function chooseDate(user: ReturnType<typeof userEvent.setup>, field: string, date: string) {
  await user.click(screen.getByLabelText(field, { exact: true }));
  await user.click(await screen.findByRole('button', { name: date }));
}

describe('developer calendar range picker', () => {
  it('allows arbitrary start and end dates and waits for apply', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: '自定义' }));
    await chooseDate(user, '开始日期', '2026-10-03');
    expect(screen.getByRole('button', { name: '查看此时间段' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    await chooseDate(user, '结束日期', '2026-10-19');
    expect(onChange).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: '查看此时间段' }));
    expect(onChange).toHaveBeenLastCalledWith({ start_date: '2026-10-03', end_date: '2026-10-19' });
  });

  it.each([
    [7, '2026-10-09'],
    [14, '2026-10-16'],
  ] as const)(
    'applies %s inclusive days from the selected start in one click',
    async (days, end) => {
      const { user, onChange } = setup();
      await user.click(screen.getByRole('button', { name: '自定义' }));
      await chooseDate(user, '开始日期', '2026-10-03');
      const quick = screen.getByRole('group', { name: '从开始日期一键选择并查看' });
      await user.click(within(quick).getByRole('button', { name: `${days} 天` }));
      expect(onChange).toHaveBeenCalledExactlyOnceWith({ start_date: '2026-10-03', end_date: end });
      expect(screen.getByLabelText('结束日期', { exact: true })).toHaveTextContent(end);
    },
  );

  it('allows same-day dates and prevents reversed or future calendar choices', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: '自定义' }));
    await chooseDate(user, '开始日期', today);
    await user.click(screen.getByLabelText('结束日期', { exact: true }));
    expect(screen.getByRole('button', { name: '2026-10-27' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '2026-10-29' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: today }));
    await user.click(screen.getByRole('button', { name: '查看此时间段' }));
    expect(onChange).toHaveBeenCalledWith({ start_date: today, end_date: today });
    const quick = screen.getByRole('group', { name: '从开始日期一键选择并查看' });
    for (const button of within(quick).getAllByRole('button')) expect(button).toBeDisabled();
  });

  it('disables actions with an empty start and switches back to recent presets', async () => {
    const { user, onChange } = setup();
    await user.click(screen.getByRole('button', { name: '自定义' }));
    await user.click(screen.getByRole('button', { name: '清除开始日期' }));
    expect(screen.getByLabelText('结束日期', { exact: true })).toBeDisabled();
    expect(screen.getByRole('button', { name: '查看此时间段' })).toBeDisabled();
    expect(onChange).not.toHaveBeenCalled();
    await user.click(
      within(screen.getByRole('group', { name: '最近时间段' })).getByRole('button', {
        name: '7 天',
      }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ start_date: '2026-10-22', end_date: today });
    expect(screen.queryByLabelText('开始日期', { exact: true })).not.toBeInTheDocument();
  });

  it('applies twelve calendar months including a leap-day start', async () => {
    const { user, onChange } = setup('2024-02-29', '2024-03-01');
    await user.click(screen.getByRole('button', { name: '自定义' }));
    await user.click(
      within(screen.getByRole('group', { name: '从开始日期一键选择并查看' })).getByRole('button', {
        name: '12 个月',
      }),
    );
    expect(onChange).toHaveBeenCalledExactlyOnceWith({
      start_date: '2024-02-29',
      end_date: '2025-02-28',
    });
    await user.click(screen.getByLabelText('结束日期', { exact: true }));
    expect(screen.getByRole('button', { name: '2025-02-28' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '2025-03-01' })).toBeDisabled();
  });
});
