import { Router } from "express";
import upload from "../middlewares/multer.middlewares.js"
import verifyJWT from "../middlewares/auth.middlewares.js";
import { publishAVideo ,getVideoById,updateVideo,deleteVideo,getAllVideos} from "../controllers/video.controller.js";
import { getRounds } from "bcrypt";

const videoRouter = Router()

videoRouter.route("/")
    .post(
        verifyJWT,
            upload.fields([
            {
                name : "videoFile",
                maxCount : 1
            },
            {
                name : "thumbNail",
                maxCount : 1
            }]),
        publishAVideo
    )
    .get(
        verifyJWT,
        getAllVideos
    )


videoRouter.route("/:videoId")
    .get(
        verifyJWT,
        getVideoById
    )
    .patch(
        verifyJWT,
        upload.single("thumbNail"),
        updateVideo
    )
    .delete(
        verifyJWT,
        deleteVideo
    )

export default videoRouter