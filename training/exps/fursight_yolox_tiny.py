"""YOLOX-Tiny for FurSight: one class (the pet), trained on SAM 3.1 labels.

Geometry mirrors exps/default/yolox_tiny.py (depth 0.33 / width 0.375). 416 px keeps it fast
enough for the webcam page (onnxruntime-web) while a rabbit in a pen stays plenty large.
The dataset comes from label_with_sam.mjs; FURSIGHT_DATA points at it.
"""
import os

from yolox.exp import Exp as MyExp


class Exp(MyExp):
    def __init__(self):
        super(Exp, self).__init__()

        self.depth = 0.33
        self.width = 0.375
        self.input_size = (416, 416)
        self.test_size = (416, 416)
        self.mosaic_scale = (0.5, 1.5)
        self.random_size = (10, 20)
        self.enable_mixup = False

        here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.data_dir = os.environ.get("FURSIGHT_DATA", os.path.join(here, "data", "xiaosi"))
        self.train_ann = "instances_train.json"
        self.val_ann = "instances_val.json"
        self.num_classes = 1

        # One pet, one pen: a few hundred frames from COCO-pretrained weights converge fast.
        self.max_epoch = 40
        self.no_aug_epochs = 8
        self.warmup_epochs = 2
        self.eval_interval = 5
        self.print_interval = 10

        self.data_num_workers = 4
        self.save_history_ckpt = False

        self.exp_name = os.path.split(os.path.realpath(__file__))[1].split(".")[0]

    # YOLOX names image folders after the split; label_with_sam.mjs symlinks train/ and val/ to images/
    def get_dataset(self, cache=False, cache_type="ram"):
        from yolox.data import COCODataset, TrainTransform
        return COCODataset(data_dir=self.data_dir, json_file=self.train_ann, name="train", img_size=self.input_size,
                           preproc=TrainTransform(max_labels=50, flip_prob=self.flip_prob, hsv_prob=self.hsv_prob),
                           cache=cache, cache_type=cache_type)

    def get_eval_dataset(self, **kwargs):
        from yolox.data import COCODataset, ValTransform
        return COCODataset(data_dir=self.data_dir, json_file=self.val_ann, name="val", img_size=self.test_size,
                           preproc=ValTransform(legacy=kwargs.get("legacy", False)))
