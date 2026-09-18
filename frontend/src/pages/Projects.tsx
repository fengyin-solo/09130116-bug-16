import React, { useEffect, useState } from 'react';
import {
  Card,
  Table,
  Button,
  Space,
  Modal,
  Form,
  Input,
  Popconfirm,
  message,
  Tag,
  Typography,
  Upload,
  Progress,
  Empty,
} from 'antd';
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  EyeOutlined,
  UploadOutlined,
  DatabaseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchProjects,
  createProject,
  updateProject,
  deleteProject,
} from '../store/slices/projectSlice';
import { fetchSeismicData, uploadSeismicData, setCurrentSeismic } from '../store/slices/seismicSlice';
import { RootState, AppDispatch } from '../store';
import { Project, SeismicData } from '../types';

const { Title, Text } = Typography;

const Projects: React.FC = () => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);
  const [form] = Form.useForm();
  const [uploadForm] = Form.useForm();
  const navigate = useNavigate();
  const dispatch = useDispatch<AppDispatch>();

  const { projects, loading } = useSelector((state: RootState) => state.projects);
  const { seismicList, uploadProgress } = useSelector((state: RootState) => state.seismic);

  useEffect(() => {
    dispatch(fetchProjects());
  }, [dispatch]);

  const handleCreate = () => {
    setEditingProject(null);
    form.resetFields();
    setIsModalOpen(true);
  };

  const handleEdit = (project: Project) => {
    setEditingProject(project);
    form.setFieldsValue(project);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: number) => {
    const result = await dispatch(deleteProject(id));
    if (deleteProject.fulfilled.match(result)) {
      message.success('项目删除成功');
    }
  };

  const handleSubmit = async (values: any) => {
    if (editingProject) {
      await dispatch(updateProject({ id: editingProject.id, data: values }));
      message.success('项目更新成功');
    } else {
      await dispatch(createProject(values));
      message.success('项目创建成功');
    }
    setIsModalOpen(false);
  };

  const handleOpenViewer = (seismic: SeismicData) => {
    dispatch(setCurrentSeismic(seismic));
    navigate(`/viewer/${seismic.id}`);
  };

  const handleUpload = (project: Project) => {
    setSelectedProject(project);
    uploadForm.resetFields();
    setIsUploadModalOpen(true);
    dispatch(fetchSeismicData(project.id));
  };

  const handleUploadSubmit = async (values: any) => {
    if (!selectedProject) return;

    const file = values.file?.file;
    if (!file) {
      message.error('请选择要上传的文件');
      return;
    }

    const result = await dispatch(
      uploadSeismicData({
        projectId: selectedProject.id,
        name: values.name,
        description: values.description || '',
        file: file.originFileObj,
      })
    );

    if (uploadSeismicData.fulfilled.match(result)) {
      message.success('地震数据上传成功');
      setIsUploadModalOpen(false);
      dispatch(fetchSeismicData(selectedProject.id));
    }
  };

  const projectColumns = [
    {
      title: '项目名称',
      dataIndex: 'name',
      key: 'name',
      render: (text: string) => <strong>{text}</strong>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (date: string) => new Date(date).toLocaleString('zh-CN'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      render: (_: any, record: Project) => (
        <Space>
          <Button
            type="primary"
            size="small"
            icon={<DatabaseOutlined />}
            onClick={() => handleUpload(record)}
          >
            数据管理
          </Button>
          <Button
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEdit(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个项目吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const seismicColumns = [
    {
      title: '数据名称',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: '文件大小',
      dataIndex: 'file_size',
      key: 'file_size',
      render: (size: number) => (size ? `${(size / 1024 / 1024).toFixed(2)} MB` : '-'),
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: string) => {
        const colorMap: Record<string, string> = {
          ready: 'green',
          processing: 'blue',
          uploading: 'orange',
          error: 'red',
        };
        const textMap: Record<string, string> = {
          ready: '就绪',
          processing: '处理中',
          uploading: '上传中',
          error: '错误',
        };
        return <Tag color={colorMap[status] || 'default'}>{textMap[status] || status}</Tag>;
      },
    },
    {
      title: '数据维度',
      key: 'dimensions',
      render: (_: any, record: SeismicData) => (
        <span>
          {record.num_inlines} × {record.num_crosslines} × {record.num_depths}
        </span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 150,
      render: (_: any, record: SeismicData) => (
        <Space>
          {record.status === 'ready' && (
            <Button
              type="primary"
              size="small"
              icon={<EyeOutlined />}
              onClick={() => handleOpenViewer(record)}
            >
              查看
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24 }}>
      <div style={{ marginBottom: 24 }}>
        <Title level={2} style={{ margin: 0 }}>
          项目管理
        </Title>
        <Text type="secondary">管理地震数据项目和数据集</Text>
      </div>

      <Card
        extra={
          <Button type="primary" icon={<PlusOutlined />} onClick={handleCreate}>
            新建项目
          </Button>
        }
      >
        <Table
          columns={projectColumns}
          dataSource={projects}
          rowKey="id"
          loading={loading}
          pagination={{ pageSize: 10 }}
        />
      </Card>

      <Modal
        title={editingProject ? '编辑项目' : '新建项目'}
        open={isModalOpen}
        onCancel={() => setIsModalOpen(false)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label="项目名称"
            rules={[{ required: true, message: '请输入项目名称' }]}
          >
            <Input placeholder="请输入项目名称" />
          </Form.Item>
          <Form.Item name="description" label="项目描述">
            <Input.TextArea rows={4} placeholder="请输入项目描述" />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">
                保存
              </Button>
              <Button onClick={() => setIsModalOpen(false)}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={`地震数据管理 - ${selectedProject?.name}`}
        open={isUploadModalOpen}
        onCancel={() => setIsUploadModalOpen(false)}
        width={800}
        footer={null}
      >
        <Card
          title="上传地震数据"
          size="small"
          style={{ marginBottom: 16 }}
        >
          <Form form={uploadForm} layout="vertical" onFinish={handleUploadSubmit}>
            <Space direction="vertical" style={{ width: '100%' }}>
              <Form.Item
                name="name"
                label="数据名称"
                rules={[{ required: true, message: '请输入数据名称' }]}
              >
                <Input placeholder="请输入数据名称" />
              </Form.Item>
              <Form.Item name="description" label="描述">
                <Input.TextArea rows={2} placeholder="请输入描述" />
              </Form.Item>
              <Form.Item
                name="file"
                label="SEG-Y文件"
                rules={[{ required: true, message: '请选择文件' }]}
              >
                <Upload
                  maxCount={1}
                  beforeUpload={() => false}
                  accept=".sgy,.segy"
                  showUploadList={true}
                >
                  <Button icon={<UploadOutlined />}>选择SEG-Y文件</Button>
                </Upload>
              </Form.Item>
              {uploadProgress > 0 && uploadProgress < 100 && (
                <Progress percent={uploadProgress} />
              )}
              <Form.Item>
                <Button type="primary" htmlType="submit" loading={loading}>
                  上传
                </Button>
              </Form.Item>
            </Space>
          </Form>
        </Card>

        <Card title="地震数据列表" size="small">
          {seismicList.length === 0 ? (
            <Empty description="暂无地震数据" />
          ) : (
            <Table
              columns={seismicColumns}
              dataSource={seismicList}
              rowKey="id"
              size="small"
              pagination={{ pageSize: 5 }}
            />
          )}
        </Card>
      </Modal>
    </div>
  );
};

export default Projects;
