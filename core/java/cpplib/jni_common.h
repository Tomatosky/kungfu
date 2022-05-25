#ifndef JNI_COMMON_H
#define JNI_COMMON_H

#define JAVA_RUNTIME_EXCEPTION env->FindClass("java/lang/RuntimeException")
#define JAVA_THROW(exception, msg) env->ThrowNew(exception, msg)
#define JAVA_THROW_RUNTIME_EXCEPTION(msg) JAVA_THROW(JAVA_RUNTIME_EXCEPTION, msg)

#endif