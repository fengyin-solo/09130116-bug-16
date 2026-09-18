import os
import uuid
import tempfile
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, BackgroundTasks, Query
from fastapi.responses import StreamingResponse, JSONResponse
from sqlalchemy.orm import Session
import numpy as np

from ..database import get_db
from .. import models, schemas
from ..auth import get_current_active_user, check_project_permission
from ..services.seismic_processor import seismic_processor
from ..services.storage_service import storage_service
from ..services.cache_service import cache_service
from ..config import get_settings

settings = get_settings()
router = APIRouter(prefix="/seismic", tags=["Seismic Data"])


@router.get("/project/{project_id}", response_model=List[schemas.SeismicData])
async def list_seismic_data(
    project_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    check_project_permission(current_user, project_id, "viewer", db)

    seismic_data = db.query(models.SeismicData).filter(
        models.SeismicData.project_id == project_id
    ).all()

    return seismic_data


@router.post("/project/{project_id}/upload", response_model=schemas.SeismicData)
async def upload_seismic_data(
    project_id: int,
    name: str = Query(...),
    description: Optional[str] = Query(None),
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    check_project_permission(current_user, project_id, "editor", db)

    seismic_record = models.SeismicData(
        project_id=project_id,
        name=name,
        description=description,
        file_type="segy",
        created_by=current_user.id,
        status="processing"
    )
    db.add(seismic_record)
    db.commit()
    db.refresh(seismic_record)

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".sgy") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name

        file_size = os.path.getsize(tmp_path)
        seismic_record.file_size = file_size

        object_name = f"seismic/{seismic_record.id}/{uuid.uuid4()}.sgy"
        storage_service.upload_file(tmp_path, object_name)
        seismic_record.file_path = object_name
        seismic_record.storage_type = "minio"

        try:
            header_info = seismic_processor.parse_segy_header(tmp_path)
            for key, value in header_info.items():
                if hasattr(seismic_record, key) and value is not None:
                    setattr(seismic_record, key, value)

            stats = seismic_processor.compute_statistics(tmp_path)
            seismic_record.min_value = stats.get("min_value")
            seismic_record.max_value = stats.get("max_value")
            seismic_record.mean_value = stats.get("mean_value")
            seismic_record.std_value = stats.get("std_value")

            seismic_record.status = "ready"
        except Exception as e:
            seismic_record.status = "error"
            seismic_record.error_message = str(e)

        db.commit()
        db.refresh(seismic_record)

        os.unlink(tmp_path)

    except Exception as e:
        seismic_record.status = "error"
        seismic_record.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))

    return seismic_record


@router.get("/{seismic_id}", response_model=schemas.SeismicData)
async def get_seismic_data(
    seismic_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    seismic = db.query(models.SeismicData).filter(models.SeismicData.id == seismic_id).first()
    if not seismic:
        raise HTTPException(status_code=404, detail="Seismic data not found")

    check_project_permission(current_user, seismic.project_id, "viewer", db)

    return seismic


@router.delete("/{seismic_id}")
async def delete_seismic_data(
    seismic_id: int,
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    seismic = db.query(models.SeismicData).filter(models.SeismicData.id == seismic_id).first()
    if not seismic:
        raise HTTPException(status_code=404, detail="Seismic data not found")

    check_project_permission(current_user, seismic.project_id, "editor", db)

    if seismic.file_path and storage_service.file_exists(seismic.file_path):
        storage_service.delete_file(seismic.file_path)

    db.delete(seismic)
    db.commit()

    return {"message": "Seismic data deleted successfully"}


@router.get("/{seismic_id}/slice/{slice_type}/{slice_index}")
async def get_slice(
    seismic_id: int,
    slice_type: str,
    slice_index: int,
    colormap: str = Query("seismic"),
    min_value: Optional[float] = Query(None),
    max_value: Optional[float] = Query(None),
    format: str = Query("png"),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    seismic = db.query(models.SeismicData).filter(models.SeismicData.id == seismic_id).first()
    if not seismic:
        raise HTTPException(status_code=404, detail="Seismic data not found")

    check_project_permission(current_user, seismic.project_id, "viewer", db)

    cache_key = f"slice:{seismic_id}:{slice_type}:{slice_index}:{colormap}:{min_value}:{max_value}:{format}"
    cached = cache_service.get(cache_key)
    if cached:
        return StreamingResponse(cached, media_type="image/png")

    if not seismic.file_path:
        raise HTTPException(status_code=400, detail="No file associated with this seismic data")

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".sgy") as tmp:
            storage_service.download_file(seismic.file_path, tmp.name)
            file_path = tmp.name

        if slice_type == "inline":
            slice_data = seismic_processor.get_inline_slice(file_path, slice_index)
        elif slice_type == "crossline":
            slice_data = seismic_processor.get_crossline_slice(file_path, slice_index)
        elif slice_type == "depth":
            slice_data = seismic_processor.get_depth_slice(file_path, slice_index)
        else:
            raise HTTPException(status_code=400, detail="Invalid slice type")

        if format == "json":
            return JSONResponse({
                "slice_type": slice_type,
                "slice_index": slice_index,
                "data": slice_data.tolist(),
                "shape": list(slice_data.shape),
                "min": float(np.min(slice_data)),
                "max": float(np.max(slice_data))
            })

        if min_value is None:
            min_value = seismic.min_value
        if max_value is None:
            max_value = seismic.max_value

        # 与前端 normalizeValueRange / getEffectiveValueRange 同一套规则：
        # 保证 min <= max，避免拖窄到上下限重合时出现除零/空白
        if min_value is not None and max_value is not None:
            if not np.isfinite(min_value):
                min_value = seismic.min_value
            if not np.isfinite(max_value):
                max_value = seismic.max_value
            if min_value is not None and max_value is not None and min_value > max_value:
                min_value, max_value = max_value, min_value

        image_buffer = seismic_processor.generate_thumbnail(
            slice_data, colormap, min_value, max_value
        )

        cache_service.set(cache_key, image_buffer.getvalue(), expire_seconds=86400)
        image_buffer.seek(0)

        os.unlink(file_path)

        return StreamingResponse(image_buffer, media_type="image/png")

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{seismic_id}/subvolume")
async def get_subvolume(
    seismic_id: int,
    inline_start: int = Query(...),
    inline_end: int = Query(...),
    crossline_start: int = Query(...),
    crossline_end: int = Query(...),
    depth_start: int = Query(...),
    depth_end: int = Query(...),
    current_user: models.User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    seismic = db.query(models.SeismicData).filter(models.SeismicData.id == seismic_id).first()
    if not seismic:
        raise HTTPException(status_code=404, detail="Seismic data not found")

    check_project_permission(current_user, seismic.project_id, "viewer", db)

    if not seismic.file_path:
        raise HTTPException(status_code=400, detail="No file associated with this seismic data")

    cache_key = f"subvolume:{seismic_id}:{inline_start}-{inline_end}:{crossline_start}-{crossline_end}:{depth_start}-{depth_end}"
    cached = cache_service.get_json(cache_key)
    if cached:
        return cached

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".sgy") as tmp:
            storage_service.download_file(seismic.file_path, tmp.name)
            file_path = tmp.name

        subvolume = seismic_processor.get_subvolume(
            file_path,
            (inline_start, inline_end),
            (crossline_start, crossline_end),
            (depth_start, depth_end)
        )

        result = {
            "shape": list(subvolume.shape),
            "data": subvolume.tolist(),
            "bounds": {
                "inline": [inline_start, inline_end],
                "crossline": [crossline_start, crossline_end],
                "depth": [depth_start, depth_end]
            }
        }

        cache_service.set_json(cache_key, result, expire_seconds=3600)
        os.unlink(file_path)

        return result

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/measurement")
async def perform_measurement(
    request: schemas.MeasurementRequest,
    current_user: models.User = Depends(get_current_active_user)
):
    points = request.points
    measurement_type = request.measurement_type

    if measurement_type == "distance":
        if len(points) < 2:
            raise HTTPException(status_code=400, detail="Distance measurement requires at least 2 points")

        p1 = points[0]
        p2 = points[1]
        distance = np.sqrt(
            (p2.x - p1.x) ** 2 +
            (p2.y - p1.y) ** 2 +
            (p2.z - p1.z) ** 2
        )

        return schemas.MeasurementResult(
            measurement_type="distance",
            value=float(distance),
            unit="m",
            points=points
        )

    elif measurement_type == "area":
        if len(points) < 3:
            raise HTTPException(status_code=400, detail="Area measurement requires at least 3 points")

        polygon = np.array([[p.x, p.y, p.z] for p in points])
        if len(points) == 3:
            v1 = polygon[1] - polygon[0]
            v2 = polygon[2] - polygon[0]
            area = 0.5 * np.linalg.norm(np.cross(v1, v2))
        else:
            area = 0.0
            for i in range(len(polygon) - 2):
                v1 = polygon[i + 1] - polygon[0]
                v2 = polygon[i + 2] - polygon[0]
                area += 0.5 * np.linalg.norm(np.cross(v1, v2))

        return schemas.MeasurementResult(
            measurement_type="area",
            value=float(area),
            unit="m²",
            points=points
        )

    elif measurement_type == "volume":
        if len(points) < 4:
            raise HTTPException(status_code=400, detail="Volume measurement requires at least 4 points")

        volume = 0.0
        polygon = np.array([[p.x, p.y, p.z] for p in points])
        origin = np.mean(polygon, axis=0)

        for i in range(len(polygon)):
            j = (i + 1) % len(polygon)
            k = (i + 2) % len(polygon)

            v1 = polygon[i] - origin
            v2 = polygon[j] - origin
            v3 = polygon[k] - origin

            volume += abs(np.dot(v1, np.cross(v2, v3))) / 6.0

        return schemas.MeasurementResult(
            measurement_type="volume",
            value=float(volume),
            unit="m³",
            points=points
        )

    else:
        raise HTTPException(status_code=400, detail="Invalid measurement type")
