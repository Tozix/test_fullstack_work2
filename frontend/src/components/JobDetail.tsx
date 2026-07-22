import {
  App,
  Button,
  Card,
  Descriptions,
  Progress,
  Space,
  Table,
  Tag,
  Typography,
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { SafetyCertificateOutlined, StopOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { useJobStore } from '../store/useJobStore';
import {
  ITEM_STATUS_COLORS,
  ITEM_STATUS_LABELS,
  JOB_STATUS_COLORS,
  JOB_STATUS_LABELS,
  TERMINAL_JOB_STATUSES,
} from '../status';
import type { ItemStatus, UrlItem } from '../types';

const IN_FLIGHT: Set<ItemStatus> = new Set(['pending', 'in_progress']);
const TLS_PREFIX = 'TLS:';

export function JobDetail() {
  const { message } = App.useApp();
  const activeJobId = useJobStore((s) => s.activeJobId);
  const activeJobDetails = useJobStore((s) => s.activeJobDetails);
  const cancelActiveJob = useJobStore((s) => s.cancelActiveJob);
  const clearActiveJob = useJobStore((s) => s.clearActiveJob);

  if (!activeJobId) return null;
  const job = activeJobDetails;
  const total = job?.items?.length ?? 0;
  const done = job?.items.filter((i) => !IN_FLIGHT.has(i.status)).length ?? 0;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const cancellable = job ? !TERMINAL_JOB_STATUSES.has(job.status) : false;

  const onCancel = async () => {
    const result = await cancelActiveJob();
    if (result) message.success('Задание отменено');
  };

  const renderError = (e?: string) => {
    if (!e) return '—';
    if (e.startsWith(TLS_PREFIX)) {
      return (
        <Tag color="red" icon={<SafetyCertificateOutlined />}>
          {e.slice(TLS_PREFIX.length).trim() || 'ошибка TLS'}
        </Tag>
      );
    }
    return <Typography.Text type="danger">{e}</Typography.Text>;
  };

  const columns: ColumnsType<UrlItem> = [
    { title: 'URL', dataIndex: 'url', key: 'url', ellipsis: true },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 140,
      render: (s: ItemStatus) => <Tag color={ITEM_STATUS_COLORS[s]}>{ITEM_STATUS_LABELS[s]}</Tag>,
    },
    {
      title: 'HTTP',
      dataIndex: 'httpStatus',
      key: 'httpStatus',
      width: 80,
      render: (v?: number) => (v !== undefined ? v : '—'),
    },
    {
      title: 'Ошибка',
      dataIndex: 'error',
      key: 'error',
      ellipsis: true,
      render: renderError,
    },
    {
      title: 'Начало',
      dataIndex: 'startTime',
      key: 'startTime',
      width: 100,
      render: (v?: number) => (v ? dayjs(v).format('HH:mm:ss') : '—'),
    },
    {
      title: 'Конец',
      dataIndex: 'endTime',
      key: 'endTime',
      width: 100,
      render: (v?: number) => (v ? dayjs(v).format('HH:mm:ss') : '—'),
    },
    {
      title: 'Длительность (мс)',
      dataIndex: 'duration',
      key: 'duration',
      width: 130,
      align: 'right',
      render: (v?: number) => (v !== undefined ? v : '—'),
    },
  ];

  return (
    <Card
      title={
        <Space>
          <Typography.Text strong>Детали задания</Typography.Text>
          {job && (
            <Tag color={JOB_STATUS_COLORS[job.status]}>{JOB_STATUS_LABELS[job.status]}</Tag>
          )}
        </Space>
      }
      extra={
        <Space>
          {cancellable && (
            <Button danger icon={<StopOutlined />} onClick={onCancel} data-testid="cancel-job">
              Отменить задание
            </Button>
          )}
          <Button onClick={clearActiveJob}>Закрыть</Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      {!job ? (
        <Typography.Text type="secondary">Загрузка…</Typography.Text>
      ) : (
        <>
          <Descriptions size="small" column={3} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="ID">
              <Typography.Text code>{job.id}</Typography.Text>
            </Descriptions.Item>
            <Descriptions.Item label="Создано">
              {dayjs(job.createdAt).format('YYYY-MM-DD HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Прогресс">
              {done} / {total} обработано
            </Descriptions.Item>
          </Descriptions>
          <Progress percent={percent} status={job.status === 'failed' ? 'exception' : 'active'} />
          <Table<UrlItem>
            rowKey={(r) => r.url}
            dataSource={job.items}
            columns={columns}
            pagination={false}
            size="small"
            style={{ marginTop: 12 }}
          />
        </>
      )}
    </Card>
  );
}
