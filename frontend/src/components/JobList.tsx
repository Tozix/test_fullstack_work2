import { Card, Progress, Space, Table, Tag, Tooltip, Typography } from 'antd';
import { SafetyCertificateOutlined } from '@ant-design/icons';
import type { ColumnsType, TablePaginationConfig } from 'antd/es/table';
import type { FilterValue, SorterResult } from 'antd/es/table/interface';
import dayjs from 'dayjs';
import { useEffect } from 'react';
import { useJobStore } from '../store/useJobStore';
import { JOB_STATUS_COLORS, JOB_STATUS_LABELS } from '../status';
import type { JobSummary, JobStatus } from '../types';

function progressPercent(row: JobSummary): number {
  if (row.totalUrls === 0) return 0;
  const done = row.successCount + row.errorCount;
  return Math.round((done / row.totalUrls) * 100);
}

function progressState(row: JobSummary): 'active' | 'success' | 'exception' | 'normal' {
  if (row.status === 'in_progress' || row.status === 'pending') return 'active';
  if (row.totalUrls === 0) return 'normal';
  if (row.errorCount === row.totalUrls) return 'exception';
  if (row.successCount === row.totalUrls) return 'success';
  return 'normal';
}

export function JobList() {
  const jobs = useJobStore((s) => s.jobs);
  const total = useJobStore((s) => s.total);
  const page = useJobStore((s) => s.page);
  const limit = useJobStore((s) => s.limit);
  const sortBy = useJobStore((s) => s.sortBy);
  const sortOrder = useJobStore((s) => s.sortOrder);
  const loading = useJobStore((s) => s.loadingList);
  const activeJobId = useJobStore((s) => s.activeJobId);
  const fetchJobs = useJobStore((s) => s.fetchJobs);
  const setFilters = useJobStore((s) => s.setFilters);
  const setActiveJob = useJobStore((s) => s.setActiveJob);

  useEffect(() => {
    void fetchJobs();
  }, [fetchJobs]);

  const columns: ColumnsType<JobSummary> = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100,
      render: (id: string) => (
        <Typography.Text code>{id.slice(0, 8)}</Typography.Text>
      ),
    },
    {
      title: 'Создано',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 170,
      render: (ts: number) => dayjs(ts).format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Статус',
      dataIndex: 'status',
      key: 'status',
      width: 220,
      render: (_: JobStatus, row: JobSummary) => (
        <Space orientation="vertical" size={2} style={{ width: '100%' }}>
          <Tag color={JOB_STATUS_COLORS[row.status]}>{JOB_STATUS_LABELS[row.status]}</Tag>
          <Progress
            percent={progressPercent(row)}
            size="small"
            status={progressState(row)}
            format={() => `${row.successCount + row.errorCount}/${row.totalUrls}`}
            strokeLinecap="round"
            showInfo
          />
        </Space>
      ),
    },
    {
      title: 'URL',
      dataIndex: 'totalUrls',
      key: 'totalUrls',
      width: 70,
      align: 'right',
    },
    {
      title: 'Успешно',
      dataIndex: 'successCount',
      key: 'successCount',
      width: 90,
      align: 'right',
      render: (n: number) => <span style={{ color: '#3f8600' }}>{n}</span>,
    },
    {
      title: 'Ошибки',
      dataIndex: 'errorCount',
      key: 'errorCount',
      width: 110,
      align: 'right',
      render: (n: number, row: JobSummary) => (
        <Space size={4} style={{ justifyContent: 'flex-end', width: '100%' }}>
          <span style={{ color: '#cf1322' }}>{n}</span>
          {row.hasTlsError && (
            <Tooltip title="Среди ошибок есть проблемы с TLS-сертификатом">
              <Tag color="red" icon={<SafetyCertificateOutlined />}>TLS</Tag>
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  const onTableChange = (
    pagination: TablePaginationConfig,
    _filters: Record<string, FilterValue | null>,
    sorter: SorterResult<JobSummary> | SorterResult<JobSummary>[],
  ) => {
    const single = Array.isArray(sorter) ? sorter[0] : sorter;
    const nextPage = pagination.current ?? page;
    const nextLimit = pagination.pageSize ?? limit;
    const field = single?.field as 'createdAt' | undefined;
    const order = single?.order;
    if (nextPage === page && nextLimit === limit && (!field || !order)) return;
    setFilters({
      page: nextPage,
      limit: nextLimit,
      sortBy: field ?? sortBy,
      sortOrder: order === 'ascend' ? 'asc' : order === 'descend' ? 'desc' : sortOrder,
    });
  };

  return (
    <Card
      title="Задания"
      style={{ marginBottom: 16 }}
      extra={
        <Space>
          <Typography.Text type="secondary">Всего: {total}</Typography.Text>
          {activeJobId && (
            <Typography.Text type="secondary">
              · Выбрано: {activeJobId.slice(0, 8)}
            </Typography.Text>
          )}
        </Space>
      }
    >
      <Table<JobSummary>
        rowKey="id"
        dataSource={jobs}
        columns={columns}
        loading={loading}
        onChange={onTableChange}
        pagination={{
          current: page,
          pageSize: limit,
          total,
          showSizeChanger: true,
          pageSizeOptions: ['10', '20', '50', '100'],
        }}
        rowClassName={(row) => (row.id === activeJobId ? 'job-row-active' : '')}
        onRow={(record) => ({
          onClick: () => setActiveJob(record.id),
          style: { cursor: 'pointer' },
        })}
      />
    </Card>
  );
}
