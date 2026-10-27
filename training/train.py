"""Train the FurSight pet detector (YOLOX-Tiny, Apache-2.0) on Apple Silicon.

    ~/pool-yolo/venv-yolox/bin/python train.py --smoke     # 1 epoch, proves the loop
    ~/pool-yolo/venv-yolox/bin/python train.py [-e 40]     # real run
    FURSIGHT_DATA=data/other_pet ... train.py              # another pet's dataset

Starts from COCO-pretrained yolox_tiny.pth (Apache-2.0). mps_patch.py comes from the PoolAssist
pipeline: YOLOX assumes CUDA, the patch moves it onto MPS without forking YOLOX.
"""
import argparse
import importlib.util
import os
import sys

import mps_patch                                   # must precede yolox imports
DEVICE = mps_patch.apply()

from loguru import logger                          # noqa: E402
import torch                                       # noqa: E402
from yolox.core import Trainer                     # noqa: E402
import yolox.core.trainer as trainer_mod           # noqa: E402
from yolox.utils import configure_module           # noqa: E402

trainer_mod.DataPrefetcher = mps_patch.SimplePrefetcher

# a missing ninja makes YOLOX's C++ COCOeval raise RuntimeError instead of falling back to pycocotools
import yolox.layers as _yolox_layers               # noqa: E402
if hasattr(_yolox_layers, "COCOeval_opt"):
    del _yolox_layers.COCOeval_opt

HERE = os.path.dirname(os.path.abspath(__file__))
EXP_FILE = os.path.join(HERE, "exps", "fursight_yolox_tiny.py")
CKPT = os.environ.get("YOLOX_TINY_PTH", os.path.expanduser("~/pool-yolo/yolox_tiny.pth"))


def load_exp(path):
    spec = importlib.util.spec_from_file_location("fursight_exp", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.Exp()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--smoke", action="store_true")
    ap.add_argument("-b", "--batch-size", type=int, default=16)
    ap.add_argument("-e", "--epochs", type=int, default=None)
    ap.add_argument("--resume", action="store_true")
    cli = ap.parse_args()

    configure_module()
    exp = load_exp(EXP_FILE)
    if cli.smoke:
        exp.max_epoch, exp.no_aug_epochs, exp.warmup_epochs, exp.eval_interval = 1, 0, 0, 1
        exp.exp_name += "_smoke"
    elif cli.epochs:
        exp.max_epoch = cli.epochs
    exp.output_dir = os.path.join(HERE, "YOLOX_outputs")

    args = argparse.Namespace(
        experiment_name=exp.exp_name, batch_size=cli.batch_size, fp16=False, cache=None, occupy=False,
        logger="tensorboard", ckpt=CKPT, exp_file=EXP_FILE, resume=cli.resume, start_epoch=None,
        devices=1, name=None,
    )
    logger.info(f"exp {exp.exp_name} | device {DEVICE} | data {exp.data_dir} | epochs {exp.max_epoch}")
    trainer = Trainer(exp, args)
    trainer.device = DEVICE
    trainer.data_type = torch.float32
    trainer.train()


if __name__ == "__main__":
    sys.path.insert(0, HERE)
    main()
