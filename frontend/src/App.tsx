import { App as AntApp, ConfigProvider, Layout, Space, Typography, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { JobCreateForm } from './components/JobCreateForm';
import { JobList } from './components/JobList';
import { JobDetail } from './components/JobDetail';

const { Header, Content } = Layout;

export default function App() {
  return (
    <ConfigProvider locale={ruRU} theme={{ algorithm: theme.defaultAlgorithm }}>
      <AntApp>
        <Layout style={{ minHeight: '100vh' }}>
          <Header>
            <Space>
              <Typography.Title level={3} style={{ color: 'white', margin: 0 }}>
                URL Checker
              </Typography.Title>
            </Space>
          </Header>
          <Content style={{ padding: 24, maxWidth: 1200, margin: '0 auto', width: '100%' }}>
            <JobCreateForm />
            <JobList />
            <JobDetail />
          </Content>
        </Layout>
      </AntApp>
    </ConfigProvider>
  );
}
