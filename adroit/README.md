# Optional: Princeton Adroit training job

**Off the critical path.** The demo runs without anything here. Use this only if the CV owner has spare time after about H14.

Goal: replace the YCrCb rule in `services/cv/app/modules/eczema.py::skin_mask` with a small learned skin/lesion segmentation model (SegFormer-b0), which is more robust across skin tones and lighting.

## Data

Use **public** data only, e.g. SCIN (Google) or Fitzpatrick17k with derived masks. Arrange it as:

```
data/
  images/xxx.jpg
  masks/xxx.png      # 0 = background, 1 = skin, 2 = affected skin
```

Never put real participant media on the cluster.

## Run

```bash
ssh <netid>@adroit.princeton.edu
module load anaconda3/2024.6
conda create -n vf-seg python=3.11 -y && conda activate vf-seg
pip install torch torchvision transformers pillow numpy
# copy data/ and this folder to /scratch/network/<netid>/vf/
sbatch train_segformer.slurm
squeue -u $USER          # check queue; GPU jobs can wait, so submit early
```

The job writes `segformer-skin/` (Hugging Face format). Load it in a new `skin_mask` implementation, and record the model version in `EczemaPhotoModule.version` so every observation logs which model produced it.
