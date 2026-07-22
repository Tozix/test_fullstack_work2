import { useState } from 'react';
import { App, Badge, Button, Card, Input, Space } from 'antd';
import { SnippetsOutlined, SendOutlined } from '@ant-design/icons';
import { extractApiErrorMessage } from '../api/errors';
import { DEMO_URLS } from '../data/demo-urls';
import { useJobStore } from '../store/useJobStore';

function parseUrls(raw: string): string[] {
  return raw.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
}

export function JobCreateForm() {
  const { message, modal } = App.useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const createJob = useJobStore((s) => s.createJob);
  const setActiveJob = useJobStore((s) => s.setActiveJob);

  const parsedCount = parseUrls(text).length;

  const applyTemplate = (replace: boolean) => {
    if (!replace && text.trim().length > 0) {
      modal.confirm({
        title: 'Заменить текущий список?',
        content: `В форме уже ${parsedCount} URL. Подставить шаблон из ${DEMO_URLS.length} адресов?`,
        okText: 'Заменить',
        cancelText: 'Отмена',
        onOk: () => {
          setText(DEMO_URLS.join('\n'));
          message.info(`Загружено ${DEMO_URLS.length} URL`);
        },
      });
      return;
    }
    setText(DEMO_URLS.join('\n'));
    message.info(`Загружено ${DEMO_URLS.length} URL`);
  };

  const onSubmit = async () => {
    const urls = parseUrls(text);
    if (urls.length === 0) {
      message.warning('Введите хотя бы один URL');
      return;
    }
    setBusy(true);
    try {
      const jobId = await createJob(urls);
      setActiveJob(jobId);
      message.success(`Задание создано: ${jobId.slice(0, 8)}`);
      setText('');
    } catch (e) {
      message.error(extractApiErrorMessage(e, 'Не удалось создать задание'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card
      title="Создать задание"
      style={{ marginBottom: 16 }}
      extra={
        parsedCount > 0 ? (
          <Badge count={parsedCount} color="blue" title="URL в форме" />
        ) : null
      }
    >
      <Space.Compact style={{ width: '100%', display: 'block' }}>
        <Input.TextArea
          rows={6}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`Введите URL, по одному на строку (до 500):\nhttps://example.com\nhttps://example.org\n\nИли нажмите «Шаблон», чтобы вставить ${DEMO_URLS.length} демо-адресов.`}
          data-testid="urls-input"
        />
      </Space.Compact>
      <Space style={{ marginTop: 12 }}>
        <Button
          icon={<SnippetsOutlined />}
          onClick={() => applyTemplate(false)}
          data-testid="template-button"
        >
          Шаблон
        </Button>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={onSubmit}
          loading={busy}
          data-testid="submit-button"
        >
          Запустить проверку
        </Button>
      </Space>
    </Card>
  );
}
