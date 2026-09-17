from datetime import datetime
from typing import Optional, List, Any
from pydantic import BaseModel, EmailStr, Field, computed_field


class Token(BaseModel):
    access_token: str
    token_type: str


class TokenData(BaseModel):
    username: Optional[str] = None


class UserBase(BaseModel):
    username: str
    email: EmailStr
    full_name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    password: Optional[str] = None


class User(UserBase):
    id: int
    is_active: bool
    is_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class Project(ProjectBase):
    id: int
    created_by: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProjectMemberBase(BaseModel):
    user_id: int
    role: str = "viewer"


class ProjectMemberCreate(ProjectMemberBase):
    pass


class ProjectMemberUpdate(BaseModel):
    role: Optional[str] = None


class ProjectMember(ProjectMemberBase):
    id: int
    project_id: int
    user: Optional[User] = None
    created_at: datetime

    class Config:
        from_attributes = True


class SeismicDataBase(BaseModel):
    name: str
    description: Optional[str] = None
    file_type: str = "segy"


class SeismicDataCreate(SeismicDataBase):
    project_id: int


class SeismicDataUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


class SeismicDataStats(BaseModel):
    min_value: float
    max_value: float
    mean_value: float
    std_value: float


class SeismicDataDimensions(BaseModel):
    inline_start: int
    inline_end: int
    inline_step: int
    crossline_start: int
    crossline_end: int
    crossline_step: int
    depth_start: float
    depth_end: float
    depth_step: float
    num_inlines: int
    num_crosslines: int
    num_depths: int


class SeismicData(SeismicDataBase):
    id: int
    project_id: int
    file_size: Optional[float] = None
    inline_start: Optional[int] = None
    inline_end: Optional[int] = None
    inline_step: Optional[int] = None
    crossline_start: Optional[int] = None
    crossline_end: Optional[int] = None
    crossline_step: Optional[int] = None
    depth_start: Optional[float] = None
    depth_end: Optional[float] = None
    depth_step: Optional[float] = None
    num_inlines: Optional[int] = None
    num_crosslines: Optional[int] = None
    num_depths: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    mean_value: Optional[float] = None
    std_value: Optional[float] = None
    status: str
    upload_progress: float
    created_by: int
    created_at: datetime

    @computed_field
    @property
    def dimensions(self) -> Optional[SeismicDataDimensions]:
        required_dimensions = [
            self.inline_start,
            self.inline_end,
            self.inline_step,
            self.crossline_start,
            self.crossline_end,
            self.crossline_step,
            self.depth_start,
            self.depth_end,
            self.depth_step,
            self.num_inlines,
            self.num_crosslines,
            self.num_depths,
        ]
        if any(value is None for value in required_dimensions):
            return None
        return SeismicDataDimensions(
            inline_start=int(self.inline_start),
            inline_end=int(self.inline_end),
            inline_step=int(self.inline_step),
            crossline_start=int(self.crossline_start),
            crossline_end=int(self.crossline_end),
            crossline_step=int(self.crossline_step),
            depth_start=float(self.depth_start),
            depth_end=float(self.depth_end),
            depth_step=float(self.depth_step),
            num_inlines=int(self.num_inlines),
            num_crosslines=int(self.num_crosslines),
            num_depths=int(self.num_depths),
        )

    @computed_field
    @property
    def statistics(self) -> Optional[SeismicDataStats]:
        if self.min_value is None or self.max_value is None or self.mean_value is None or self.std_value is None:
            return None
        return SeismicDataStats(
            min_value=float(self.min_value),
            max_value=float(self.max_value),
            mean_value=float(self.mean_value),
            std_value=float(self.std_value),
        )

    class Config:
        from_attributes = True


class SliceRequest(BaseModel):
    seismic_data_id: int
    slice_type: str
    slice_index: int
    colormap: Optional[str] = "seismic"
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class SliceData(BaseModel):
    slice_type: str
    slice_index: int
    data: List[List[float]]
    width: int
    height: int


class WellBase(BaseModel):
    name: str
    uwi: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    kb_elevation: Optional[float] = None
    total_depth: Optional[float] = None


class WellCreate(WellBase):
    project_id: int


class WellUpdate(BaseModel):
    name: Optional[str] = None
    uwi: Optional[str] = None
    x: Optional[float] = None
    y: Optional[float] = None
    kb_elevation: Optional[float] = None
    total_depth: Optional[float] = None


class Well(WellBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        from_attributes = True


class AnnotationBase(BaseModel):
    name: Optional[str] = None
    annotation_type: str
    geometry: dict
    properties: Optional[dict] = None


class AnnotationCreate(AnnotationBase):
    seismic_data_id: int


class AnnotationUpdate(BaseModel):
    name: Optional[str] = None
    geometry: Optional[dict] = None
    properties: Optional[dict] = None


class Annotation(AnnotationBase):
    id: int
    seismic_data_id: int
    owner_id: int
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class ProcessingTaskBase(BaseModel):
    task_type: str
    seismic_data_id: Optional[int] = None
    parameters: Optional[dict] = None


class ProcessingTaskCreate(ProcessingTaskBase):
    pass


class ProcessingTask(ProcessingTaskBase):
    id: int
    status: str
    progress: float
    created_by: int
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None

    class Config:
        from_attributes = True


class UploadSession(BaseModel):
    session_id: str
    file_name: str
    file_size: int
    project_id: int
    uploaded_chunks: List[int]
    total_chunks: int
    status: str


class MeasurementPoint(BaseModel):
    x: float
    y: float
    z: float


class MeasurementRequest(BaseModel):
    points: List[MeasurementPoint]
    measurement_type: str


class MeasurementResult(BaseModel):
    measurement_type: str
    value: float
    unit: str
    points: List[MeasurementPoint]
