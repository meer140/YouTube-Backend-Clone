import asyncHandler from "../utils/asyncHandler.js";
import ApiError from "../utils/apiError.js";
import User from "../models/user.model.js";
import uploadOnCloudinary from "../utils/cloudinary.js";
import ApiResponse from "../utils/apiResponse.js";
import jwt from "jsonwebtoken"

const registerUser = asyncHandler(async (req, res) => {
  const { fullName, username, password, email } = req.body;

  if ([fullName, username, password, email].some((field) => !field?.trim())) {
    throw new ApiError(400, "All fields are required");
  }

  const exitedUser = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (exitedUser) {
    throw new ApiError(409, "User with the email or username already exists");
  }

  const avaterLocalPath = req.files?.avatar[0]?.path;

  let coverImageLocalPath;
  if (
    req.files &&
    Array.isArray(req.files.coverImage) &&
    req.files.coverImage.length > 0
  ) {
    coverImageLocalPath = req.files?.coverImage[0]?.path;
  }

  if (!avaterLocalPath) {
    throw new ApiError(409, "Avatar file is required");
  }

  const avatar = await uploadOnCloudinary(avaterLocalPath);
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!avatar) {
    throw new ApiError(409, "Avatar file is required");
  }

  const user = await User.create({
    fullName,
    avatar: avatar.url,
    coverImage: coverImage?.url || "",
    email,
    password,
    username: username.toLowerCase(),
  });

  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  return res
    .status(201)
    .json(new ApiResponse(200, createdUser, "User registered successfully"));
});

const generateAccessTokenAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);

    const accessToken = await user.generateAccessToken();
    const refreshToken = await user.generateRefreshToken();

    user.refreshToken = refreshToken;
    user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (err) {
    console.log("TOKEN ERROR:", err);
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh tokens"
    );
  }
};

const userLogin = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!email && !username) {
    throw new ApiError(400, "user or email is required");
  }

  const user = await User.findOne({
    $or: [{ email }, { username }],
  });

  if (!user) {
    throw new ApiError(404, "user does not exist");
  }

  const isPasswordCorrect = await user.isPasswordCorrect(password);

  if (!isPasswordCorrect) {
    throw new ApiError(401, "Invalid user credentials");
  }

  const { accessToken, refreshToken } =
    await generateAccessTokenAndRefreshToken(user._id);

  const LoggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .cookie("accessToken", accessToken, options)
    .cookie("refreshToken", refreshToken, options)
    .json(
      new ApiResponse(
        200,
        { user: LoggedInUser, accessToken, refreshToken },
        "User successfully logged in"
      )
    );
});

const userLogOut = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: {
        refreshToken: "",
      },
    },
    {
      returnDocument: "after",
    }
  );

  const options = {
    httpOnly: true,
    secure: true,
  };

  return res
    .status(200)
    .clearCookie("accessToken", options)
    .clearCookie("refreshToken", options)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

const refreshAccessToken = asyncHandler(async (req,res) => {
    const incomingRefreshToken = req.cookie.refreshToken || req.body.refreshToken

    if(!incomingRefreshToken){
        throw new ApiError(401,"Unauthorized request")
    }
    
    const decodedToken = await jwt.verify(incomingRefreshToken,process.env.REFRESH_TOKEN_SECRET)
    
    const user = User.findById(decodedToken?._id)

    if(!user){
        throw new ApiError(401,"Invalid refresh token")
    }

    if(incomingRefreshToken !== user?.refreshToken){
        throw new ApiError(401,"Refresh token is expired")
    }
    
    const options = {
    httpOnly: true,
    secure: true,
    };

    const {accessToken,refreshToken} = await user.generateAccessTokenAndRefreshToken(user._id)
    
    return res
    .status(200)
    .cookie("accessToken",accessToken)
    .cookie("refreshToken",refreshToken)
    .json(
        new ApiResponse(
            200,
            {accessToken,refreshToken},
            "Access Token is refreshed"
        )
    )
})

const changeCurrentPassword = asyncHandler(async (req,res) => {
  const {oldPassword,newPassword} = req.body

  const user = await User.findById(req.user?._id)

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword)

  if(!isPasswordCorrect){
    throw new ApiError(400,"Incorrect password")
  }

  user.password = newPassword
  await user.save({validateBeforeSave:false})

  return res
  .status(200)
  .json(
    new ApiResponse(200,{},"Password is changed successfully")
  )

})

const updateUserDetail = asyncHandler(async (req,res) => {
  const {fullName,email} = req.body

  if(!fullName || !email){
    throw new ApiError(400,"All fields are required")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set : {
        fullName,
        email
      }
    },
    {
      returnDocument: "after"
    }
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Account detail updated successfully"))
})

const updateUserAvatar = asyncHandler(async (req,res) => {
  const avatarLocalPath = req.file?.path

  if(!avatarLocalPath){
    throw new ApiError(400,"Avatar file is missing")
  }

  const avatar = await uploadOnCloudinary(avatarLocalPath)

  if(!avatar.url){
    throw new ApiError(400,"Error while uploading file on cloudinary")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set : {
        avatar : avatar.url
      }
    },
    {
      returnDocument: "after"
    }
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"Avatar updatad successfully"))
})

const updateUserCoverImage = asyncHandler(async (req,res) => {
  const coverImageLocalPath = req.file?.path

  if(!coverImageLocalPath){
    throw new ApiError(400,"coverImage file is missing")
  }

  const coverImage = await uploadOnCloudinary(coverImageLocalPath)

  if(!coverImage.url){
    throw new ApiError(400,"Error while uploading file on cloudinary")
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set : {
        coverImage : coverImage.url
      }
    },
    {
      returnDocument: "after"
    }
  ).select("-password")

  return res
  .status(200)
  .json(new ApiResponse(200,user,"coverImage updatad successfully"))
})

const getUserChannelProfile = asyncHandler(async (res,req) => {
  const {username} = req.params

  if(!username){
    throw new ApiError(400,"Username is missing")
  }

  const channel = await User.aggregate([
    {
      $match : {
        username : username?.toLowerCase()
      }
    },
    {
      $lookup : {
        from : "subscriptions",
        localField : "_id",
        foreignField : "channel",
        as: "subscribers"
      }
    },
    {
      $lookup : {
        from : "subscriptions",
        localField : "_id",
        foreignField : "subscriber",
        as: "subscribed"
      }
    },
    {
      $addFields : {
        subscribersCount : {
          $size : "$subscribers"
        },
        subscribedCount : {
          $size : "$subscribed"
        },
        isSubscribed : {
          $cond : {
            if : {$in : [req.user?._id,"$subscribers.subscriber"]},
            then : true,
            else : false

          }
        }
      }
    },
    {
      $project : {
        fullName : 1,
        username : 1,
        subscribedCount : 1,
        subscribersCount : 1,
        email : 1,
        avatar : 1,
        coverImage : 1
      }
    }
  ])

  if(!channel){
    throw new ApiError(404,"Channel does not exits")
  }

  return res
  .status(200)
  .json(new ApiResponse(200,channel[0],"User channel fetched successfully"))
})

export { 
  registerUser, 
  userLogin,
  userLogOut,
  refreshAccessToken,
  changeCurrentPassword,
  updateUserDetail,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile
};
